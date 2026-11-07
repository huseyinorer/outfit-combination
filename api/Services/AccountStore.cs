using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using Npgsql;

namespace OutfitCombination.Api.Services;

public sealed record AccountUser(
    Guid Id,
    string Email,
    string DisplayName,
    string? PictureUrl);

public sealed record OAuthAttempt(string State, Guid InstallationId);

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
        await using var command = dataSource.CreateCommand("""
            WITH principal AS (
                INSERT INTO account_principals(subject_hash)
                VALUES (@subjectHash)
                ON CONFLICT(subject_hash) DO UPDATE SET last_seen_at = now()
                RETURNING id
            )
            INSERT INTO app_users(id, google_subject, email, display_name, picture_url)
            SELECT id, @subject, @email, @displayName, @pictureUrl FROM principal
            ON CONFLICT(id) DO UPDATE SET
                google_subject = excluded.google_subject,
                email = excluded.email,
                display_name = excluded.display_name,
                picture_url = excluded.picture_url,
                last_login_at = now()
            RETURNING id, email, display_name, picture_url;
            """);
        command.Parameters.AddWithValue("subject", subject);
        command.Parameters.AddWithValue("subjectHash", PrincipalHash(subject));
        command.Parameters.AddWithValue("email", email);
        command.Parameters.AddWithValue("displayName", displayName);
        command.Parameters.AddWithValue("pictureUrl", (object?)pictureUrl ?? DBNull.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new InvalidOperationException("Kullanıcı hesabı oluşturulamadı.");
        return ReadUser(reader);
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
            SELECT u.id, u.email, u.display_name, u.picture_url
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
            SELECT id, email, display_name, picture_url
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
                    google_subject varchar(255) NOT NULL UNIQUE,
                    email varchar(320) NOT NULL,
                    display_name varchar(200) NOT NULL DEFAULT '',
                    picture_url text NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    last_login_at timestamptz NOT NULL DEFAULT now()
                );
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
                DELETE FROM account_oauth_attempts WHERE expires_at <= now();
                DELETE FROM account_exchange_codes WHERE expires_at <= now();
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
        reader.IsDBNull(3) ? null : reader.GetString(3));

    private static string RandomToken(int bytes) => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(bytes));
    private static byte[] Hash(string token) => SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
    private byte[] PrincipalHash(string subject) => HMACSHA256.HashData(principalHashKey, Encoding.UTF8.GetBytes(subject));

    public async ValueTask DisposeAsync()
    {
        initializationLock.Dispose();
        if (dataSource is not null) await dataSource.DisposeAsync();
    }
}
