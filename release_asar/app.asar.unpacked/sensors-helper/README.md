# SensorsHelper

A lightweight C# console application that reads hardware sensors using LibreHardwareMonitor and outputs JSON.

## Building

Requires .NET 6 SDK or later.

```powershell
cd electron/sensors-helper
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The output will be in: `bin/Release/net6.0/win-x64/publish/SensorsHelper.exe`

Copy `SensorsHelper.exe` to `electron/bin/SensorsHelper.exe` for the app to use it.

## Output Format

```json
{
  "cpuTempC": 45.0,
  "gpuTempC": 52.0,
  "moboTempC": 38.0,
  "chipsetTempC": 55.0,
  "vrmTempC": 42.0,
  "diskTemps": [
    { "name": "Samsung SSD 970 EVO", "tempC": 35.0 }
  ]
}
```

Values are `null` when sensors are unavailable.

## Notes

- Does NOT require admin rights for most sensors
- Some motherboard sensors may require elevated permissions
- Fails gracefully if sensors are unavailable
