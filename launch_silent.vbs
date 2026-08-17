Dim fso, scriptDir, WshShell, pyExe

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = scriptDir

' Locate python or pythonw executable
pyExe = "C:\Users\juanc\AppData\Local\Programs\Python\Python311\pythonw.exe"
If Not fso.FileExists(pyExe) Then
    pyExe = "C:\Users\juanc\AppData\Local\Programs\Python\Python311\python.exe"
End If
If Not fso.FileExists(pyExe) Then
    pyExe = "python"
End If

' Run start_system.py completely hidden (0 = Hide Window, False = don't wait)
WshShell.Run """" & pyExe & """ """ & scriptDir & "\start_system.py""", 0, False

Set WshShell = Nothing
Set fso = Nothing
