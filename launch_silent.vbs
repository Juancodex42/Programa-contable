Set WshShell = CreateObject("WScript.Shell")
' Run the batch file hidden (0 = Hide Window)
WshShell.Run chr(34) & "python" & chr(34) & " " & chr(34) & "start_system.py" & chr(34), 0
Set WshShell = Nothing
