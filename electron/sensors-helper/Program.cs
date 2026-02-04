using System;
using System.Collections.Generic;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;

class SensorData
{
    public double? cpuTempC { get; set; }
    public double? gpuTempC { get; set; }
    public double? moboTempC { get; set; }
    public double? chipsetTempC { get; set; }
    public double? vrmTempC { get; set; }
    public List<DiskTemp> diskTemps { get; set; } = new List<DiskTemp>();
}

class DiskTemp
{
    public string name { get; set; } = "";
    public double? tempC { get; set; }
}

class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer)
    {
        computer.Traverse(this);
    }

    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (IHardware subHardware in hardware.SubHardware)
            subHardware.Accept(this);
    }

    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

class Program
{
    static void Main(string[] args)
    {
        var data = new SensorData();

        try
        {
            var computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMotherboardEnabled = true,
                IsStorageEnabled = true
            };

            computer.Open();
            computer.Accept(new UpdateVisitor());

            foreach (IHardware hardware in computer.Hardware)
            {
                switch (hardware.HardwareType)
                {
                    case HardwareType.Cpu:
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                if (sensor.Name.Contains("Package") || sensor.Name.Contains("Core Average") || 
                                    (sensor.Name.Contains("Core") && data.cpuTempC == null))
                                {
                                    if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 150)
                                    {
                                        data.cpuTempC = Math.Round(sensor.Value.Value, 1);
                                    }
                                }
                            }
                        }
                        break;

                    case HardwareType.GpuNvidia:
                    case HardwareType.GpuAmd:
                    case HardwareType.GpuIntel:
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature && 
                                (sensor.Name.Contains("GPU Core") || sensor.Name.Contains("Temperature")))
                            {
                                if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 150)
                                {
                                    data.gpuTempC = Math.Round(sensor.Value.Value, 1);
                                    break;
                                }
                            }
                        }
                        break;

                    case HardwareType.Motherboard:
                        foreach (IHardware subHardware in hardware.SubHardware)
                        {
                            foreach (ISensor sensor in subHardware.Sensors)
                            {
                                if (sensor.SensorType == SensorType.Temperature && sensor.Value.HasValue)
                                {
                                    double val = sensor.Value.Value;
                                    if (val > 0 && val < 150)
                                    {
                                        string name = sensor.Name.ToLower();
                                        if (name.Contains("vrm") || name.Contains("mos") || name.Contains("vcore"))
                                        {
                                            if (data.vrmTempC == null)
                                                data.vrmTempC = Math.Round(val, 1);
                                        }
                                        else if (name.Contains("chipset") || name.Contains("pch"))
                                        {
                                            if (data.chipsetTempC == null)
                                                data.chipsetTempC = Math.Round(val, 1);
                                        }
                                        else if (name.Contains("system") || name.Contains("mainboard") || name.Contains("board"))
                                        {
                                            if (data.moboTempC == null)
                                                data.moboTempC = Math.Round(val, 1);
                                        }
                                        else if (data.moboTempC == null && !name.Contains("cpu"))
                                        {
                                            data.moboTempC = Math.Round(val, 1);
                                        }
                                    }
                                }
                            }
                        }
                        break;

                    case HardwareType.Storage:
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature && sensor.Value.HasValue)
                            {
                                if (sensor.Value.Value > 0 && sensor.Value.Value < 100)
                                {
                                    data.diskTemps.Add(new DiskTemp
                                    {
                                        name = hardware.Name,
                                        tempC = Math.Round(sensor.Value.Value, 1)
                                    });
                                    break;
                                }
                            }
                        }
                        break;
                }
            }

            computer.Close();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
        }

        var options = new JsonSerializerOptions { WriteIndented = false };
        Console.WriteLine(JsonSerializer.Serialize(data, options));
    }
}
