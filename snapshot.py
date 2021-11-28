from webai import *
from time import sleep
repl = UART.repl_uart()
img = webai.snapshot()
webai.show(img=img)
jpg = img.compress(80)
img = None
jpg = jpg.to_bytes()
repl.write("JPGSize:")
repl.write(str(len(jpg)))
repl.write('\r\n')
sleep(0.005)
repl.write(jpg)
