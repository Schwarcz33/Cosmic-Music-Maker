' Violet Media - Cosmic Music Maker
' Silent Windows launcher: starts the local HTTP server and opens the default browser.
' No console window, no interaction. Double-click from Explorer or run at login.

Option Explicit

Dim WshShell, fso, scriptDir, projectRoot, port, url, netstat, output
Dim serverRunning

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Locate project root (parent of tools/)
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)

' Port chosen to avoid collisions with common local dev servers
port = 4862
url = "http://localhost:" & port & "/"

' Check if the port is already listening
serverRunning = False
On Error Resume Next
Set netstat = WshShell.Exec("cmd /c netstat -ano | findstr :" & port & " | findstr LISTENING")
If Err.Number = 0 Then
  output = netstat.StdOut.ReadAll()
  If InStr(output, "LISTENING") > 0 Then serverRunning = True
End If
On Error GoTo 0

If Not serverRunning Then
  ' Start the server hidden. Requires Python on PATH.
  WshShell.CurrentDirectory = projectRoot
  WshShell.Run "cmd /c python -m http.server " & port, 0, False
  WScript.Sleep 800
End If

' Open the app in the default browser
WshShell.Run url, 1, False
