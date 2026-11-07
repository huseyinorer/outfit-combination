using Microsoft.Extensions.Options;
using Npgsql;
using System.Collections.Concurrent;

namespace OutfitCombination.Api.Services;

public sealed class PersistentUsageQuotaService : IAsyncDisposable
{
    private readonly UsageQuotaOptions options;
    private readonly NpgsqlDataSource? dataSource;
    private readonly ILogger<PersistentUsageQuotaService> logger;
    private readonly bool developmentFallback;
    private readonly ConcurrentDictionary<string, int> memoryCounts = new();
    private readonly object memoryLock = new();
    private readonly SemaphoreSlim initializationLock = new(1, 1);
    private bool initialized;

    public PersistentUsageQuotaService(
        IOptions<UsageQuotaOptions> options,
        IHostEnvironment environment,
        ILogger<PersistentUsageQuotaService> logger)
    {
        this.options = options.Value;
        this.logger = logger;
        developmentFallback = environment.IsDevelopment();
        var connectionString = this.options.ConnectionString?.Trim();
        if (string.IsNullOrEmpty(connectionString))
            connectionString = Environment.GetEnvironmentVariable("NEON_DATABASE_URL")?.Trim();

        if (!string.IsNullOrEmpty(connectionString))
            dataSource = NpgsqlDataSource.Create(connectionString);
        else if (!environment.IsDevelopment())
            logger.LogError("Kalıcı AI kotası için UsageQuota:ConnectionString veya NEON_DATABASE_URL ayarlanmamış.");
        else
            logger.LogWarning("Geliştirme ortamında kalıcı AI kota veritabanı ayarlanmamış.");
    }

    public bool IsPersistent => dataSource is not null;

    public async Task<QuotaDecision> TryConsumeAsync(
        string subjectId,
        AiOperation operation,
        CancellationToken cancellationToken)
    {
        if (dataSource is null)
            return developmentFallback
                ? TryConsumeInMemory(subjectId, operation)
                : new QuotaDecision(QuotaStatus.Unavailable);
        if (!Guid.TryParse(subjectId, out var subjectGuid))
            return new QuotaDecision(QuotaStatus.Unavailable);

        try
        {
            await EnsureInitializedAsync(cancellationToken);
            await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

            await using (var lockCommand = new NpgsqlCommand(
                "SELECT pg_advisory_xact_lock(hashtextextended(@installation, 0));",
                connection,
                transaction))
            {
                lockCommand.Parameters.AddWithValue("installation", subjectId);
                await lockCommand.ExecuteNonQueryAsync(cancellationToken);
            }

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var month = new DateOnly(today.Year, today.Month, 1);
            var (dailyLimit, monthlyLimit) = Limits(operation);

            var dailyUsed = await ReadCountAsync(connection, transaction, subjectGuid, "day", today, operation, cancellationToken);
            var monthlyUsed = await ReadCountAsync(connection, transaction, subjectGuid, "month", month, operation, cancellationToken);
            if (dailyUsed >= dailyLimit || monthlyUsed >= monthlyLimit)
            {
                await transaction.RollbackAsync(cancellationToken);
                return new QuotaDecision(QuotaStatus.Exceeded, dailyUsed, monthlyUsed);
            }

            await IncrementAsync(connection, transaction, subjectGuid, "day", today, operation, cancellationToken);
            await IncrementAsync(connection, transaction, subjectGuid, "month", month, operation, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new QuotaDecision(QuotaStatus.Allowed, dailyUsed + 1, monthlyUsed + 1);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "Kalıcı AI kotası kontrol edilemedi");
            return new QuotaDecision(QuotaStatus.Unavailable);
        }
    }

    public async Task<UsageSnapshot?> GetSnapshotAsync(string subjectId, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(subjectId, out var subjectGuid)) return null;
        if (dataSource is null) return developmentFallback ? SnapshotInMemory(subjectId) : null;

        try
        {
            await EnsureInitializedAsync(cancellationToken);
            await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var month = new DateOnly(today.Year, today.Month, 1);
            var dailyAnalysis = await ReadCountAsync(connection, transaction, subjectGuid, "day", today, AiOperation.Analysis, cancellationToken);
            var monthlyAnalysis = await ReadCountAsync(connection, transaction, subjectGuid, "month", month, AiOperation.Analysis, cancellationToken);
            var dailyOutfit = await ReadCountAsync(connection, transaction, subjectGuid, "day", today, AiOperation.Outfit, cancellationToken);
            var monthlyOutfit = await ReadCountAsync(connection, transaction, subjectGuid, "month", month, AiOperation.Outfit, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            var analysisLimits = Limits(AiOperation.Analysis);
            var outfitLimits = Limits(AiOperation.Outfit);
            return new UsageSnapshot(
                dailyAnalysis,
                analysisLimits.Daily,
                monthlyAnalysis,
                analysisLimits.Monthly,
                dailyOutfit,
                outfitLimits.Daily,
                monthlyOutfit,
                outfitLimits.Monthly);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "AI kullanım özeti okunamadı");
            return null;
        }
    }

    public async Task RefundAsync(string subjectId, AiOperation operation, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(subjectId, out var subjectGuid)) return;
        if (dataSource is null)
        {
            if (developmentFallback) RefundInMemory(subjectId, operation);
            return;
        }

        try
        {
            await EnsureInitializedAsync(cancellationToken);
            await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            await using (var lockCommand = new NpgsqlCommand(
                "SELECT pg_advisory_xact_lock(hashtextextended(@subject, 0));",
                connection,
                transaction))
            {
                lockCommand.Parameters.AddWithValue("subject", subjectId);
                await lockCommand.ExecuteNonQueryAsync(cancellationToken);
            }

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var month = new DateOnly(today.Year, today.Month, 1);
            await DecrementAsync(connection, transaction, subjectGuid, "day", today, operation, cancellationToken);
            await DecrementAsync(connection, transaction, subjectGuid, "month", month, operation, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "Başarısız AI isteğinin kullanım hakkı iade edilemedi");
        }
    }

    private QuotaDecision TryConsumeInMemory(string installationId, AiOperation operation)
    {
        if (!Guid.TryParse(installationId, out _)) return new QuotaDecision(QuotaStatus.Unavailable);
        var now = DateTime.UtcNow;
        var operationKey = operation == AiOperation.Analysis ? "analysis" : "outfit";
        var dailyKey = $"{installationId}:day:{now:yyyy-MM-dd}:{operationKey}";
        var monthlyKey = $"{installationId}:month:{now:yyyy-MM}:{operationKey}";
        var dailyLimit = operation == AiOperation.Analysis ? options.DailyAnalysisLimit : options.DailyOutfitLimit;
        var monthlyLimit = operation == AiOperation.Analysis ? options.MonthlyAnalysisLimit : options.MonthlyOutfitLimit;
        lock (memoryLock)
        {
            var daily = memoryCounts.GetValueOrDefault(dailyKey);
            var monthly = memoryCounts.GetValueOrDefault(monthlyKey);
            if (daily >= dailyLimit || monthly >= monthlyLimit)
                return new QuotaDecision(QuotaStatus.Exceeded, daily, monthly);
            memoryCounts[dailyKey] = daily + 1;
            memoryCounts[monthlyKey] = monthly + 1;
            return new QuotaDecision(QuotaStatus.Allowed, daily + 1, monthly + 1);
        }
    }

    private UsageSnapshot SnapshotInMemory(string subjectId)
    {
        var now = DateTime.UtcNow;
        int Count(string period, string operation) => memoryCounts.GetValueOrDefault($"{subjectId}:{period}:{(period == "day" ? $"{now:yyyy-MM-dd}" : $"{now:yyyy-MM}")}:{operation}");
        var analysisLimits = Limits(AiOperation.Analysis);
        var outfitLimits = Limits(AiOperation.Outfit);
        return new UsageSnapshot(
            Count("day", "analysis"), analysisLimits.Daily,
            Count("month", "analysis"), analysisLimits.Monthly,
            Count("day", "outfit"), outfitLimits.Daily,
            Count("month", "outfit"), outfitLimits.Monthly);
    }

    private void RefundInMemory(string subjectId, AiOperation operation)
    {
        var now = DateTime.UtcNow;
        var operationKey = operation == AiOperation.Analysis ? "analysis" : "outfit";
        var dailyKey = $"{subjectId}:day:{now:yyyy-MM-dd}:{operationKey}";
        var monthlyKey = $"{subjectId}:month:{now:yyyy-MM}:{operationKey}";
        lock (memoryLock)
        {
            if (memoryCounts.GetValueOrDefault(dailyKey) > 0) memoryCounts[dailyKey]--;
            if (memoryCounts.GetValueOrDefault(monthlyKey) > 0) memoryCounts[monthlyKey]--;
        }
    }

    private (int Daily, int Monthly) Limits(AiOperation operation)
    {
        var daily = operation == AiOperation.Analysis
            ? Math.Clamp(options.DailyAnalysisLimit, 1, 10_000)
            : Math.Clamp(options.DailyOutfitLimit, 1, 10_000);
        var monthly = operation == AiOperation.Analysis
            ? Math.Clamp(options.MonthlyAnalysisLimit, daily, 100_000)
            : Math.Clamp(options.MonthlyOutfitLimit, daily, 100_000);
        return (daily, monthly);
    }

    private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (initialized) return;
        await initializationLock.WaitAsync(cancellationToken);
        try
        {
            if (initialized) return;
            await using var command = dataSource!.CreateCommand("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'ai_usage_quota' AND column_name = 'installation_id'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'ai_usage_quota' AND column_name = 'subject_id'
                    ) THEN
                        ALTER TABLE ai_usage_quota RENAME COLUMN installation_id TO subject_id;
                    END IF;
                END $$;
                CREATE TABLE IF NOT EXISTS ai_usage_quota (
                    subject_id uuid NOT NULL,
                    period_type varchar(8) NOT NULL CHECK (period_type IN ('day', 'month')),
                    period_key date NOT NULL,
                    analysis_count integer NOT NULL DEFAULT 0 CHECK (analysis_count >= 0),
                    outfit_count integer NOT NULL DEFAULT 0 CHECK (outfit_count >= 0),
                    updated_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (subject_id, period_type, period_key)
                );
                CREATE INDEX IF NOT EXISTS idx_ai_usage_updated_at ON ai_usage_quota(updated_at);
                DELETE FROM ai_usage_quota WHERE period_key < current_date - interval '13 months';
                """);
            await command.ExecuteNonQueryAsync(cancellationToken);
            initialized = true;
        }
        finally
        {
            initializationLock.Release();
        }
    }

    private static async Task<int> ReadCountAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid installationId,
        string periodType,
        DateOnly periodKey,
        AiOperation operation,
        CancellationToken cancellationToken)
    {
        await using var insert = new NpgsqlCommand("""
            INSERT INTO ai_usage_quota(subject_id, period_type, period_key)
            VALUES (@installation, @periodType, @periodKey)
            ON CONFLICT DO NOTHING;
            """, connection, transaction);
        insert.Parameters.AddWithValue("installation", installationId);
        insert.Parameters.AddWithValue("periodType", periodType);
        insert.Parameters.AddWithValue("periodKey", periodKey);
        await insert.ExecuteNonQueryAsync(cancellationToken);

        var column = operation == AiOperation.Analysis ? "analysis_count" : "outfit_count";
        await using var select = new NpgsqlCommand($"""
            SELECT {column}
            FROM ai_usage_quota
            WHERE subject_id = @installation AND period_type = @periodType AND period_key = @periodKey
            FOR UPDATE;
            """, connection, transaction);
        select.Parameters.AddWithValue("installation", installationId);
        select.Parameters.AddWithValue("periodType", periodType);
        select.Parameters.AddWithValue("periodKey", periodKey);
        return Convert.ToInt32(await select.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task IncrementAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid installationId,
        string periodType,
        DateOnly periodKey,
        AiOperation operation,
        CancellationToken cancellationToken)
    {
        var column = operation == AiOperation.Analysis ? "analysis_count" : "outfit_count";
        await using var command = new NpgsqlCommand($"""
            UPDATE ai_usage_quota
            SET {column} = {column} + 1, updated_at = now()
            WHERE subject_id = @installation AND period_type = @periodType AND period_key = @periodKey;
            """, connection, transaction);
        command.Parameters.AddWithValue("installation", installationId);
        command.Parameters.AddWithValue("periodType", periodType);
        command.Parameters.AddWithValue("periodKey", periodKey);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task DecrementAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        Guid subjectId,
        string periodType,
        DateOnly periodKey,
        AiOperation operation,
        CancellationToken cancellationToken)
    {
        var column = operation == AiOperation.Analysis ? "analysis_count" : "outfit_count";
        await using var command = new NpgsqlCommand($"""
            UPDATE ai_usage_quota
            SET {column} = GREATEST({column} - 1, 0), updated_at = now()
            WHERE subject_id = @subject AND period_type = @periodType AND period_key = @periodKey;
            """, connection, transaction);
        command.Parameters.AddWithValue("subject", subjectId);
        command.Parameters.AddWithValue("periodType", periodType);
        command.Parameters.AddWithValue("periodKey", periodKey);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        initializationLock.Dispose();
        if (dataSource is not null) await dataSource.DisposeAsync();
    }
}
