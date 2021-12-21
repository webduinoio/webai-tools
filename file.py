import os
from Maix import utils

repl = UART.repl_uart()
fname = repl.readLine()
f = open(fname, "wb")
while True:
    readLen = int(repl.readLine())
    if(readLen == 0):
        break
    data = repl.read(int(readLen))
    f.write(data)

f.close()