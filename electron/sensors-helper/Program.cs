using System;
using System.Collections.Generic;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;

class SensorData
{
    public double? cpuTemp { get; set; }
    public double? gpuTemp { get; set; }
    public double? motherboardTemp { get; set; }
    public List<DiskTemp> disks { get; set; } = new List<DiskTemp>();
    public bool isAdmin { get; set; }
}

class DiskTemp
{
    public string name { get; set; } = "";
    public double? temp { get; set; }
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
    static bool IsAdministrator()
    {
        try
        {
            using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    static void Main(string[] args)
    {
        var data = new SensorData();
        data.isAdmin = IsAdministrator();

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
                                string name = sensor.Name.ToLower();
                                if (name.Contains("package") || name.Contains("core average") || 
                                    (name.Contains("core") && data.cpuTemp == null))
                                {
                                    if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 150)
                                    {
                                        data.cpuTemp = Math.Round(sensor.Value.Value, 1);
                                    }
                                }
                            }
                        }
                        break;

                    case HardwareType.GpuNvidia:
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                string name = sensor.Name.ToLower();
                                if (name.Contains("core") || name.Contains("gpu"))
                                {
                                    if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 150)
                                    {
                                        data.gpuTemp = Math.Round(sensor.Value.Value, 1);
                                        break;
                                    }
                                }
                            }
                        }
                        break;

                    case HardwareType.GpuAmd:
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                string name = sensor.Name.ToLower();
                                if (name.Contains("edge") || name.Contains("temperature") || name.Contains("gpu"))
                                {
                                    if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 150)
                                    {
                                        data.gpuTemp = Math.Round(sensor.Value.Value, 1);
                                        break;
                                    }
                                }
                            }
                        }
                        break;

                    case HardwareType.GpuIntel:
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 150)
                                {
                                    data.gpuTemp = Math.Round(sensor.Value.Value, 1);
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
                                        if (name.Contains("system") || name.Contains("mainboard") || 
                                            name.Contains("board") || name.Contains("chipset") || name.Contains("pch"))
                                        {
                                            if (data.motherboardTemp == null)
                                                data.motherboardTemp = Math.Round(val, 1);
                                        }
                                        else if (data.motherboardTemp == null && !name.Contains("cpu") && 
                                                 !name.Contains("vrm") && !name.Contains("mos"))
                                        {
                                            data.motherboardTemp = Math.Round(val, 1);
                                        }
                                    }
                                }
                            }
                        }
                        break;

                    case HardwareType.Storage:
                        double? diskTemp = null;
                        foreach (ISensor sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                if (sensor.Value.HasValue && sensor.Value.Value > 0 && sensor.Value.Value < 100)
                                {
                                    diskTemp = Math.Round(sensor.Value.Value, 1);
                                    break;
                                }
                            }
                        }
                        data.disks.Add(new DiskTemp
                        {
                            name = hardware.Name,
                            temp = diskTemp
                        });
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
