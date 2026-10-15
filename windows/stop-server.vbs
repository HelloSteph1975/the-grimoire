' Asks the server to back up and stop, without flashing a window.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
nodeExe = "node"
pf = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If fso.FileExists(pf) Then nodeExe = """" & pf & """"
sh.CurrentDirectory = appDir
sh.Run "cmd /c """ & nodeExe & " """ & appDir & "\scripts\stop.js"" >nul 2>&1""", 0, True
