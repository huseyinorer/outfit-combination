FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY api/OutfitCombination.Api.csproj api/
COPY mobile/app-version.json mobile/
RUN dotnet restore api/OutfitCombination.Api.csproj

COPY api/ api/
RUN dotnet publish api/OutfitCombination.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:10000
EXPOSE 10000
ENTRYPOINT ["dotnet", "OutfitCombination.Api.dll"]
