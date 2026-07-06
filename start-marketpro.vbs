Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\Users\emma2\Desktop\Memoria\marketplace-clone"
shell.Run "cmd /c node server.js", 0, False
