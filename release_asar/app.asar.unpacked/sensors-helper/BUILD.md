# SensorsHelper Build Instructions

This helper requires compilation on a Windows machine with .NET 6+ SDK.

## Prerequisites
- Windows 10/11
- .NET 6 SDK or later: https://dotnet.microsoft.com/download

## Build Steps

1. Open PowerShell or Command Prompt
2. Navigate to this directory:
   ```
   cd electron/sensors-helper
   ```

3. Build the self-contained executable:
   ```
   dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ../bin
   ```

4. Verify the output:
   ```
   dir ../bin/SensorsHelper.exe
   ```

## Output Location
The compiled executable will be at:
```
electron/bin/SensorsHelper.exe
```

## Electron Builder
The `electron-builder.json` is already configured to include `electron/bin/` in the installer via `extraResources`.

## Runtime Behavior
- In development: Electron looks for `electron/bin/SensorsHelper.exe`
- In production (installed app): Electron looks for `resources/bin/SensorsHelper.exe`

## Dependencies
The helper uses LibreHardwareMonitorLib which is included as a NuGet package.
Admin rights may be required for full sensor access on some systems.
