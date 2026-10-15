' Opens The Grimoire in its own Chrome app window, starting the server first if needed.
Option Explicit
Dim fso, sh, appDir, port, cfgPath, txt, re, m, i, chrome, candidates, url, up, envPort
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
port = "4209"
cfgPath = appDir & "\config.json"
If fso.FileExists(cfgPath) Then
  txt = fso.OpenTextFile(cfgPath, 1).ReadAll
  Set re = New RegExp
  re.Pattern = """port""\s*:\s*""?\s*(\d+)\s*""?"
  Set m = re.Execute(txt)
  If m.Count > 0 Then port = m(0).SubMatches(0)
End If
envPort = sh.ExpandEnvironmentStrings("%GRIMOIRE_PORT%")
If envPort <> "%GRIMOIRE_PORT%" Then port = envPort

Function IsUp()
  Dim http
  IsUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 1000, 1000
  http.open "GET", "http://127.0.0.1:" & port & "/api/health", False
  http.send
  If Err.Number = 0 Then
    If http.status = 200 Then IsUp = True
  End If
  On Error GoTo 0
End Function

up = IsUp()
If Not up Then
  sh.Run "wscript.exe """ & appDir & "\windows\start-server.vbs""", 0, False
  For i = 1 To 30
    WScript.Sleep 500
    up = IsUp()
    If up Then Exit For
  Next
End If

If Not up Then
  MsgBox "The Grimoire couldn't start. Check that your data folder is reachable; details are in server.log in the app folder.", 48, "The Grimoire"
  WScript.Quit 1
End If

url = "http://localhost:" & port
candidates = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
  sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Google\Chrome\Application\chrome.exe")
chrome = ""
For i = 0 To UBound(candidates)
  If fso.FileExists(candidates(i)) Then
    chrome = candidates(i)
    Exit For
  End If
Next
If chrome <> "" Then
  sh.Run """" & chrome & """ --app=" & url & " --window-size=1400,900", 1, False
Else
  sh.Run url, 1, False
End If
