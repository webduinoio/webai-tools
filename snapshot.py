from webai import *
repl = UART.repl_uart()
img = webai.snapshot()
webai.show(img=img)
jpg = img.compress(80)
img = None
jpg = jpg.to_bytes()
repl.write("JPEG")
repl.write("JPEG")
repl.write(jpg)