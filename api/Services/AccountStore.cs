using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using Npgsql;

namespace OutfitCombination.Api.Services;

public static class AccountTier
{
    public const string Free = "free";
    public const string Premium = "premium";
    public static readonly string[] Values = [Free, Premium];
    public static string Normalize(string? value) =>
        string.Equals(value, Premium, StringComparison.OrdinalIgnoreCase) ? Premium : Free;
}

public sealed record AccountUser(
    Guid Id,
    string Email,
    string DisplayName,
    string? PictureUrl,
    string Tier);

public sealed record OAuthAttempt(string State, Guid InstallationId);

public enum EmailChallengeStatus
{
    Created,
    Throttled,
    Unavailable
}

public sealed class AccountStore : IAsyncDisposable
{
    private readonly NpgsqlDataSource? dataSource;
    private readonly TimeProvider timeProvider;
    private readonly ILogger<AccountStore> logger;
    private readonly byte[] principalHashKey;
    private readonly SemaphoreSlim initializationLock = new(1, 1);
    private bool initialized;

    public AccountStore(
        IOptions<UsageQuotaOptions> quotaOptions,
        IOptions<AppSecurityOptions> securityOptions,
        TimeProvider timeProvider,
        ILogger<AccountStore> logger)
    {
        this.timeProvider = timeProvider;
        this.logger = logger;
        var configuredSigningKey = securityOptions.Value.TokenSigningKey?.Trim() ?? string.Empty;
        principalHashKey = Encoding.UTF8.GetByteCount(configuredSigningKey) >= 32
            ? SHA256.HashData(Encoding.UTF8.GetBytes($"outfit-account-principal-v1:{configuredSigningKey}"))
            : RandomNumberGenerator.GetBytes(32);
        var connectionString = quotaOptions.Value.ConnectionString?.Trim();
        if (string.IsNullOrEmpty(connectionString))
            connectionString = Environment.GetEnvironmentVariable("NEON_DATABASE_URL")?.Trim();
        if (!string.IsNullOrEmpty(connectionString))
            dataSource = NpgsqlDataSource.Create(connectionString);
    }

    public bool IsPersistent => dataSource is not null;

    public async Task<OAuthAttempt?> CreateAttemptAsync(
        string installationId,
        TimeSpan lifetime,
        CancellationToken cancellationToken)
    {
        if (dataSource is null || !Guid.TryParse(installationId, out var installationGuid)) return null;
        await EnsureInitializedAsync(cancellationToken);
        var state = RandomToken(32);
        var expiresAt = timeProvider.GetUtcNow().Add(lifetime);

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var cleanup = new NpgsqlCommand(
            "DELETE FROM account_oauth_attempts WHERE expires_at <= now();",
            connection,
            transaction))
            await cleanup.ExecuteNonQueryAsync(cancellationToken);
        await using (var insert = new NpgsqlCommand("""
            INSERT INTO account_oauth_attempts(state_hash, installation_id, expires_at)
            VALUES (@stateHash, @installation, @expiresAt);
            """, connection, transaction))
        {
            insert.Parameters.AddWithValue("stateHash", Hash(state));
            insert.Parameters.AddWithValue("installation", installationGuid);
            insert.Parameters.AddWithValue("expiresAt", expiresAt);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return new OAuthAttempt(state, installationGuid);
    }

    public async Task<Guid?> ConsumeAttemptAsync(string state, CancellationToken cancellationToken)
    {
        if (dataSource is null || string.IsNullOrWhiteSpace(state)) return null;
        await EnsureInitializedAsync(cancellationToken);
        await using var command = dataSource.CreateCommand("""
            DELETE FROM account_oauth_attempts
            WHERE state_hash = @stateHash AND expires_at > now()
            RETURNING installation_id;
            """);
        command.Parameters.AddWithValue("stateHash", Hash(state));
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is Guid installationId ? installationId : null;
    }

    public async Task<AccountUser> UpsertGoogleUserAsync(
        string subject,
        string email,
        string displayName,
        string? pictureUrl,
        CancellationToken cancellationToken)
    {
        if (dataSource is null) throw new InvalidOperationException("Hesap veritabanı yapılandırılmamış.");
        await EnsureInitializedAsync(cancellationToken);
        var normalizedEmail = NormalizeEmail(email);
        if (normalizedEmail is null) throw new InvalidOperationException("Geçerli bir e-posta adresi gerekli.");

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AdvisoryLockAsync(connection, transaction, normalizedEmail, cancellationToken);

        Guid? userId = null;
        string? existingGoogleSubject = null;
        await using (var existing = new NpgsqlCommand("""
            SELECT id, google_subject
            FROM app_users
            WHERE google_subject = @subject OR lower(email) = @email
            ORDER BY CASE WHEN google_subject = @subject THEN 0 ELSE 1 END
            LIMIT 1
            FOR UPDATE;
            """, connection, transaction))
        {
            existing.Parameters.AddWithValue("subject", subject);
            existing.Parameters.AddWithValue("email", normalizedEmail);
            await using var reader = await existing.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                userId = reader.GetGuid(0);
                existingGoogleSubject = reader.IsDBNull(1) ? null : reader.GetString(1);
            }
        }

        if (existingGoogleSubject is not null && !string.Equals(existingGoogleSubject, subject, StringComparison.Ordinal))
            throw new InvalidOperationException("Bu e-posta başka bir Google kimliğiyle eşleşiyor.");
        userId ??= await GetOrCreatePrincipalAsync(
            connection,
            transaction,
            PrincipalHash(subject),
            cancellationToken);
        await LinkIdentityAsync(connection, transaction, userId.Value, PrincipalHash(subject), cancellationToken);

        var user = await UpsertUserAsync(
            connection,
            transaction,
            userId.Value,
            subject,
            normalizedEmail,
            displayName,
            pictureUrl,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return user;
    }

    public async Task<AccountUser> UpsertEmailUserAsync(
        string email,
        CancellationToken cancellationToken)
    {
        if (dataSource is null) throw new InvalidOperationException("Hesap veritabanı yapılandırılmamış.");
        await EnsureInitializedAsync(cancellationToken);
        var normalizedEmail = NormalizeEmail(email);
        if (normalizedEmail is null) throw new InvalidOperationException("Geçerli bir e-posta adresi gerekli.");

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AdvisoryLockAsync(connection, transaction, normalizedEmail, cancellationToken);

        Guid? userId = null;
        await using (var existing = new NpgsqlCommand(
            "SELECT id FROM app_users WHERE lower(email) = @email LIMIT 1 FOR UPDATE;",
            connection,
            transaction))
        {
            existing.Parameters.AddWithValue("email", normalizedEmail);
            var value = await existing.ExecuteScalarAsync(cancellationToken);
            if (value is Guid id) userId = id;
        }

        userId ??= await GetOrCreatePrincipalAsync(
            connection,
            transaction,
            PrincipalHash($"email:{normalizedEmail}"),
            cancellationToken);
        await LinkIdentityAsync(connection, transaction, userId.Value, PrincipalHash($"email:{normalizedEmail}"), cancellationToken);
        var displayName = normalizedEmail.Split('@')[0];
        var user = await UpsertUserAsync(
            connection,
            transaction,
            userId.Value,
            null,
            normalizedEmail,
            displayName,
            null,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return user;
    }

    public async Task<EmailChallengeStatus> CreateEmailChallengeAsync(
        string email,
        string installationId,
        string code,
        TimeSpan lifetime,
        TimeSpan cooldown,
        CancellationToken cancellationToken)
    {
        if (dataSource is null
            || NormalizeEmail(email) is not { } normalizedEmail
            || !Guid.TryParse(installationId, out var installationGuid)) return EmailChallengeStatus.Unavailable;
        await EnsureInitializedAsync(cancellationToken);
        var now = timeProvider.GetUtcNow();
        var emailHash = PrincipalHash($"email-login:{normalizedEmail}");

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AdvisoryLockAsync(connection, transaction, $"{normalizedEmail}:{installationId}", cancellationToken);

        await using (var existing = new NpgsqlCommand("""
            SELECT sent_at
            FROM account_email_codes
            WHERE email_hash = @emailHash AND installation_id = @installation
            FOR UPDATE;
            """, connection, transaction))
        {
            existing.Parameters.AddWithValue("emailHash", emailHash);
            existing.Parameters.AddWithValue("installation", installationGuid);
            var sentAt = await existing.ExecuteScalarAsync(cancellationToken);
            var timestamp = sentAt switch
            {
                DateTimeOffset value => value,
                DateTime value => new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)),
                _ => DateTimeOffset.MinValue
            };
            if (timestamp > now.Subtract(cooldown))
            {
                await transaction.RollbackAsync(cancellationToken);
                return EmailChallengeStatus.Throttled;
            }
        }

        await using (var upsert = new NpgsqlCommand("""
            INSERT INTO account_email_codes(email_hash, installation_id, code_hash, expires_at, attempts, sent_at)
            VALUES (@emailHash, @installation, @codeHash, @expiresAt, 0, @sentAt)
            ON CONFLICT(email_hash, installation_id) DO UPDATE SET
                code_hash = excluded.code_hash,
                expires_at = excluded.expires_at,
                attempts = 0,
                sent_at = excluded.sent_at;
            """, connection, transaction))
        {
            upsert.Parameters.AddWithValue("emailHash", emailHash);
            upsert.Parameters.AddWithValue("installation", installationGuid);
            upsert.Parameters.AddWithValue("codeHash", EmailCodeHash(normalizedEmail, installationGuid, code));
            upsert.Parameters.AddWithValue("expiresAt", now.Add(lifetime));
            upsert.Parameters.AddWithValue("sentAt", now);
            await upsert.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return EmailChallengeStatus.Created;
    }

    public async Task<bool> ConsumeEmailChallengeAsync(
        string email,
        string installationId,
        string code,
        int maximumAttempts,
        CancellationToken cancellationToken)
    {
        if (dataSource is null
            || NormalizeEmail(email) is not { } normalizedEmail
            || !Guid.TryParse(installationId, out var installationGuid)) return false;
        await EnsureInitializedAsync(cancellationToken);
        var emailHash = PrincipalHash($"email-login:{normalizedEmail}");
        var codeHash = EmailCodeHash(normalizedEmail, installationGuid, code);

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AdvisoryLockAsync(connection, transaction, $"{normalizedEmail}:{installationId}", cancellationToken);
        await using (var consume = new NpgsqlCommand("""
            DELETE FROM account_email_codes
            WHERE email_hash = @emailHash
              AND installation_id = @installation
              AND code_hash = @codeHash
              AND expires_at > @now
              AND attempts < @maximumAttempts
            RETURNING 1;
            """, connection, transaction))
        {
            consume.Parameters.AddWithValue("emailHash", emailHash);
            consume.Parameters.AddWithValue("installation", installationGuid);
            consume.Parameters.AddWithValue("codeHash", codeHash);
            consume.Parameters.AddWithValue("now", timeProvider.GetUtcNow());
            consume.Parameters.AddWithValue("maximumAttempts", maximumAttempts);
            if (await consume.ExecuteScalarAsync(cancellationToken) is not null)
            {
                await transaction.CommitAsync(cancellationToken);
                return true;
            }
        }

        await using (var failed = new NpgsqlCommand("""
            UPDATE account_email_codes
            SET attempts = attempts + 1
            WHERE email_hash = @emailHash AND installation_id = @installation;
            """, connection, transaction))
        {
            failed.Parameters.AddWithValue("emailHash", emailHash);
            failed.Parameters.AddWithValue("installation", installationGuid);
            await failed.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return false;
    }

    public async Task DeleteEmailChallengeAsync(
        string email,
        string installationId,
        CancellationToken cancellationToken)
    {
        if (dataSource is null
            || NormalizeEmail(email) is not { } normalizedEmail
            || !Guid.TryParse(installationId, out var installationGuid)) return;
        await EnsureInitializedAsync(cancellationToken);
        await using var command = dataSource.CreateCommand("""
            DELETE FROM account_email_codes
            WHERE email_hash = @emailHash AND installation_id = @installation;
            """);
        command.Parameters.AddWithValue("emailHash", PrincipalHash($"email-login:{normalizedEmail}"));
        command.Parameters.AddWithValue("installation", installationGuid);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<string> CreateExchangeCodeAsync(
        Guid userId,
        Guid installationId,
        TimeSpan lifetime,
        CancellationToken cancellationToken)
    {
        if (dataSource is null) throw new InvalidOperationException("Hesap veritabanı yapılandırılmamış.");
        await EnsureInitializedAsync(cancellationToken);
        var code = RandomToken(32);
        await using var command = dataSource.CreateCommand("""
            INSERT INTO account_exchange_codes(code_hash, user_id, installation_id, expires_at)
            VALUES (@codeHash, @userId, @installation, @expiresAt);
            """);
        command.Parameters.AddWithValue("codeHash", Hash(code));
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("installation", installationId);
        command.Parameters.AddWithValue("expiresAt", timeProvider.GetUtcNow().Add(lifetime));
        await command.ExecuteNonQueryAsync(cancellationToken);
        return code;
    }

    public async Task<AccountUser?> ConsumeExchangeCodeAsync(
        string code,
        string installationId,
        CancellationToken cancellationToken)
    {
        if (dataSource is null
            || string.IsNullOrWhiteSpace(code)
            || !Guid.TryParse(installationId, out var installationGuid)) return null;
        await EnsureInitializedAsync(cancellationToken);
        await using var command = dataSource.CreateCommand("""
            WITH consumed AS (
                DELETE FROM account_exchange_codes
                WHERE code_hash = @codeHash
                  AND installation_id = @installation
                  AND expires_at > now()
                RETURNING user_id
            )
            SELECT u.id, u.email, u.display_name, u.picture_url, u.tier
            FROM consumed c
            JOIN app_users u ON u.id = c.user_id;
            """);
        command.Parameters.AddWithValue("codeHash", Hash(code));
        command.Parameters.AddWithValue("installation", installationGuid);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<AccountUser?> GetUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (dataSource is null) return null;
        await EnsureInitializedAsync(cancellationToken);
        await using var command = dataSource.CreateCommand("""
            SELECT id, email, display_name, picture_url, tier
            FROM app_users
            WHERE id = @userId;
            """);
        command.Parameters.AddWithValue("userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadUser(reader) : null;
    }

    public async Task<bool> DeleteUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (dataSource is null) return false;
        await EnsureInitializedAsync(cancellationToken);
        await using var account = dataSource.CreateCommand("DELETE FROM app_users WHERE id = @userId;");
        account.Parameters.AddWithValue("userId", userId);
        var affected = await account.ExecuteNonQueryAsync(cancellationToken);
        return affected > 0;
    }

    private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (initialized) return;
        await initializationLock.WaitAsync(cancellationToken);
        try
        {
            if (initialized) return;
            if (dataSource is null) throw new InvalidOperationException("Hesap veritabanı yapılandırılmamış.");
            await using var command = dataSource.CreateCommand("""
                CREATE TABLE IF NOT EXISTS account_principals (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    subject_hash bytea NOT NULL UNIQUE,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    last_seen_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS app_users (
                    id uuid PRIMARY KEY REFERENCES account_principals(id) ON DELETE CASCADE,
                    google_subject varchar(255) NULL UNIQUE,
                    email varchar(320) NOT NULL,
                    display_name varchar(200) NOT NULL DEFAULT '',
                    picture_url text NULL,
                    tier varchar(16) NOT NULL DEFAULT 'free',
                    tier_expires_at timestamptz NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    last_login_at timestamptz NOT NULL DEFAULT now()
                );
                ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tier varchar(16) NOT NULL DEFAULT 'free';
                ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tier_expires_at timestamptz NULL;
                CREATE TABLE IF NOT EXISTS account_identity_links (
                    subject_hash bytea PRIMARY KEY,
                    principal_id uuid NOT NULL REFERENCES account_principals(id) ON DELETE CASCADE,
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                INSERT INTO account_identity_links(subject_hash, principal_id)
                SELECT subject_hash, id FROM account_principals
                ON CONFLICT(subject_hash) DO NOTHING;
                CREATE INDEX IF NOT EXISTS idx_account_identity_principal ON account_identity_links(principal_id);
                ALTER TABLE app_users ALTER COLUMN google_subject DROP NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_unique ON app_users(lower(email));
                CREATE TABLE IF NOT EXISTS account_oauth_attempts (
                    state_hash bytea PRIMARY KEY,
                    installation_id uuid NOT NULL,
                    expires_at timestamptz NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_account_oauth_expiry ON account_oauth_attempts(expires_at);
                CREATE TABLE IF NOT EXISTS account_exchange_codes (
                    code_hash bytea PRIMARY KEY,
                    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                    installation_id uuid NOT NULL,
                    expires_at timestamptz NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_account_exchange_expiry ON account_exchange_codes(expires_at);
                CREATE TABLE IF NOT EXISTS account_email_codes (
                    email_hash bytea NOT NULL,
                    installation_id uuid NOT NULL,
                    code_hash bytea NOT NULL,
                    expires_at timestamptz NOT NULL,
                    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                    sent_at timestamptz NOT NULL,
                    PRIMARY KEY (email_hash, installation_id)
                );
                CREATE INDEX IF NOT EXISTS idx_account_email_code_expiry ON account_email_codes(expires_at);
                DELETE FROM account_oauth_attempts WHERE expires_at <= now();
                DELETE FROM account_exchange_codes WHERE expires_at <= now();
                DELETE FROM account_email_codes WHERE expires_at <= now();
                DELETE FROM account_principals p
                WHERE p.last_seen_at < now() - interval '13 months'
                  AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id = p.id);
                """);
            await command.ExecuteNonQueryAsync(cancellationToken);
            initialized = true;
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "Hesap veritabanı hazırlanamadı");
            throw;
        }
        finally
        {
            initializationLock.Release();
        }
    }

    private static AccountUser ReadUser(NpgsqlDataReader reader) => new(
        reader.GetGuid(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.IsDBNull(3) ? null : reader.GetString(3),
        reader.FieldCount > 4 && !reader.IsDBNull(4) ? AccountTier.Normalize(reader.GetString(4)) : AccountTier.Free);

    private static string RandomToken(int bytes) => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(bytes));
    private static byte[] Hash(string token) => SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
    private byte[] PrincipalHash(string subject) => HMACSHA256.HashData(principalHashKey, Encoding.UTF8.GetBytes(subject));
    private byte[] EmailCodeHash(string email, Guid installationId, string code) =>
        HMACSHA256.HashData(principalHashKey, Encoding.UTF8.GetBytes($"{email}:{installationId}:{code}"));

    public static string? NormalizeEmail(string? email)
    {
        var value = email?.Trim().ToLowerInvariant();
        return value is { Length: > 0 and <= 320 }
            && System.Net.Mail.MailAddress.TryCreate(value, out var address)
            && string.Equals(address.Address, value, StringComparison.OrdinalIgnoreCase)
                ? value
                : null;
    }

    private static async Task AdvisoryLockAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string value,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(
            "SELECT pg_advisory_xact_lock(hashtextextended(@value, 0));",
            connection,
            transaction);
        command.Parameters.AddWithValue("value", value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<Guid> GetOrCreatePrincipalAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        byte[] subjectHash,
        CancellationToken cancellationToken)
    {
        await using (var existing = new NpgsqlCommand("""
            SELECT principal_id FROM account_identity_links WHERE subject_hash = @subjectHash;
            """, connection, transaction))
        {
            existing.Parameters.AddWithValue("subjectHash", subjectHash);
            if (await existing.ExecuteScalarAsync(cancellationToken) is Guid linkedId)
            {
                await using var touch = new NpgsqlCommand(
                    "UPDATE account_principals SET last_seen_at = now() WHERE id = @id;",
                    connection,
                    transaction);
                touch.Parameters.AddWithValue("id", linkedId);
                await touch.ExecuteNonQueryAsync(cancellationToken);
                return linkedId;
            }
        }

        Guid principalId;
        await using (var create = new NpgsqlCommand("""
            INSERT INTO account_principals(subject_hash)
            VALUES (@subjectHash)
            ON CONFLICT(subject_hash) DO UPDATE SET last_seen_at = now()
            RETURNING id;
            """, connection, transaction))
        {
            create.Parameters.AddWithValue("subjectHash", subjectHash);
            principalId = (Guid)(await create.ExecuteScalarAsync(cancellationToken)
                ?? throw new InvalidOperationException("Kullanıcı kimliği oluşturulamadı."));
        }
        await LinkIdentityAsync(connection, transaction, principalId, subjectHash, cancellationToken);
        return principalId;
    }

    private static async Task LinkIdentityAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid principalId,
        byte[] subjectHash,
        CancellationToken cancellationToken)
    {
        await using (var insert = new NpgsqlCommand("""
            INSERT INTO account_identity_links(subject_hash, principal_id)
            VALUES (@subjectHash, @principalId)
            ON CONFLICT(subject_hash) DO NOTHING;
            """, connection, transaction))
        {
            insert.Parameters.AddWithValue("subjectHash", subjectHash);
            insert.Parameters.AddWithValue("principalId", principalId);
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }
        await using var verify = new NpgsqlCommand(
            "SELECT principal_id FROM account_identity_links WHERE subject_hash = @subjectHash;",
            connection,
            transaction);
        verify.Parameters.AddWithValue("subjectHash", subjectHash);
        if (await verify.ExecuteScalarAsync(cancellationToken) is not Guid linked || linked != principalId)
            throw new InvalidOperationException("Bu giriş kimliği başka bir hesaba bağlı.");
    }

    private static async Task<AccountUser> UpsertUserAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid userId,
        string? googleSubject,
        string email,
        string displayName,
        string? pictureUrl,
        CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("""
            INSERT INTO app_users(id, google_subject, email, display_name, picture_url)
            VALUES (@id, @subject, @email, @displayName, @pictureUrl)
            ON CONFLICT(id) DO UPDATE SET
                google_subject = COALESCE(excluded.google_subject, app_users.google_subject),
                email = excluded.email,
                display_name = CASE WHEN excluded.display_name = '' THEN app_users.display_name ELSE excluded.display_name END,
                picture_url = COALESCE(excluded.picture_url, app_users.picture_url),
                last_login_at = now()
            RETURNING id, email, display_name, picture_url, tier;
            """, connection, transaction);
        command.Parameters.AddWithValue("id", userId);
        command.Parameters.AddWithValue("subject", (object?)googleSubject ?? DBNull.Value);
        command.Parameters.AddWithValue("email", email);
        command.Parameters.AddWithValue("displayName", displayName.Length > 200 ? displayName[..200] : displayName);
        command.Parameters.AddWithValue("pictureUrl", (object?)pictureUrl ?? DBNull.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new InvalidOperationException("Kullanıcı hesabı oluşturulamadı.");
        return ReadUser(reader);
    }

    public async ValueTask DisposeAsync()
    {
        initializationLock.Dispose();
        if (dataSource is not null) await dataSource.DisposeAsync();
    }
}
