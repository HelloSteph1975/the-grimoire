' Starts The Grimoire server with no console window.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = appDir
nodeExe = "node"
pf = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If fso.FileExists(pf) Then nodeExe = """" & pf & """"
sh.Run "cmd /c """ & nodeExe & " --disable-warning=ExperimentalWarning server\index.js >> """ & appDir & "\server.log"" 2>&1""", 0, False
