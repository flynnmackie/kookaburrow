// Installer custom actions (WiX Deployment Tools Foundation). They run in the installer's own process, not in a script engine.
//   DetectAddresses    lists this PC's IPv4 addresses for the Network page (KBLOCALIPS) and finds data left by an earlier installation (EXISTINGDATA)
//   ValidateNetwork    checks the listen address, port and allowed client addresses; leaves the problem in KBERR (empty when fine)
//   ValidateAdmin      checks the admin user name and password
//   ValidateAll        both, for silent installs
//   ResolveSettings    turns the chosen set-up type into the values the server is configured with (KBHOST, KBPORT, KBALLOW, KBOPEN)
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Microsoft.Deployment.WindowsInstaller;

public class KbCustomActions
{
    static List<string> LocalAddresses()
    {
        var list = new List<string>();
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var ua in nic.GetIPProperties().UnicastAddresses)
                    if (ua.Address.AddressFamily == AddressFamily.InterNetwork) list.Add(ua.Address.ToString());
            }
        }
        catch { }
        return list;
    }

    static bool IsIPv4(string s)
    {
        IPAddress a;
        return Regex.IsMatch(s, @"^\d{1,3}(\.\d{1,3}){3}$") && IPAddress.TryParse(s, out a) && a.AddressFamily == AddressFamily.InterNetwork;
    }

    static string Network(Session s)
    {
        string host = (s["LISTENIP"] ?? "").Trim();
        if (host.Length == 0) return "Enter the address the server should listen on, or 0.0.0.0 for every network interface.";
        if (!IsIPv4(host)) return "\"" + host + "\" is not an IPv4 address. Use 0.0.0.0 for every network interface.";
        if (host != "0.0.0.0" && host != "127.0.0.1" && !LocalAddresses().Contains(host))
            return host + " is not an address of this PC, so the server could not listen on it. This PC has: " + string.Join(", ", LocalAddresses().ToArray()) + ".";
        int port;
        if (!int.TryParse((s["PORT"] ?? "").Trim(), out port) || port < 1 || port > 65535) return "The port must be a number from 1 to 65535.";
        foreach (var item in Regex.Split((s["ALLOWFROM"] ?? "").Trim(), @"[\s,;]+"))
        {
            if (item.Length == 0) continue;
            var m = Regex.Match(item, @"^(\d{1,3}(?:\.\d{1,3}){3})(?:/(\d{1,2}))?$");
            if (!m.Success || !IsIPv4(m.Groups[1].Value) || (m.Groups[2].Success && int.Parse(m.Groups[2].Value) > 32))
                return "\"" + item + "\" is not an IPv4 address or range. Examples: 10.0.0.5 or 192.168.1.0/24.";
        }
        return "";
    }

    static string Admin(Session s, bool confirm)
    {
        string user = (s["ADMINLOGIN"] ?? "").Trim(), pass = s["ADMINPASS"] ?? "";
        if (!Regex.IsMatch(user, @"^[A-Za-z0-9._@-]{1,64}$")) return "The user name may only use letters, digits and . _ @ - (up to 64 characters).";
        if (pass.Length < 8) return "The password must be at least 8 characters.";
        if (pass.Contains("\"")) return "The password cannot contain a double quote (\").";
        if (confirm && pass != (s["ADMINPASS2"] ?? "")) return "The two passwords do not match.";
        return "";
    }

    [CustomAction]
    public static ActionResult DetectAddresses(Session session)
    {
        var l = LocalAddresses();
        session["KBLOCALIPS"] = l.Count == 0 ? "none found" : string.Join(",  ", l.ToArray());
        // an earlier installation's data (kept when it was uninstalled) is reused as it is
        string db = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Kookaburrow", "data", "db.json");
        session["EXISTINGDATA"] = System.IO.File.Exists(db) ? db : "";
        return ActionResult.Success;
    }

    [CustomAction]
    public static ActionResult ValidateNetwork(Session session) { session["KBERR"] = Network(session); return ActionResult.Success; }

    [CustomAction]
    public static ActionResult ValidateAdmin(Session session) { session["KBERR"] = Admin(session, true); return ActionResult.Success; }

    [CustomAction]
    public static ActionResult ValidateAll(Session session)
    {
        session["KBERR"] = "";
        if (session["EXISTINGDATA"] != "") return ActionResult.Success; // an earlier installation's data is kept as it is
        string e = "";
        if (session["SETUPMODE"] == "custom") e = Network(session);
        if (e == "") e = Admin(session, session["UILevel"] != "2" && session["ADMINPASS2"] != "");
        session["KBERR"] = e;
        return ActionResult.Success;
    }

    [CustomAction]
    public static ActionResult ResolveSettings(Session session)
    {
        bool custom = session["SETUPMODE"] == "custom";
        string host = custom ? session["LISTENIP"].Trim() : "127.0.0.1";
        session["KBHOST"] = host;
        session["KBPORT"] = custom ? session["PORT"].Trim() : "46200";
        session["KBALLOW"] = custom ? session["ALLOWFROM"].Trim() : "";
        session["KBOPEN"] = host == "127.0.0.1" ? "" : "1";
        return ActionResult.Success;
    }
}
