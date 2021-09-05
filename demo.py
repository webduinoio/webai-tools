try:
  from time import sleep
  from webai_blockly import Lcd
  from time import sleep
  
  try:
    from webai import *
  except:
    pass
  
  view = Lcd()
  
  _deviceID = '6e5436'
  try:
    print(_onServiceEvent)
    from time import sleep
    sleep(1)
    webai.mqtt.sub(topic=_deviceID + '/SERVICE', callback=_onServiceEvent)
  except:
    pass
  
  
  while True:
    view.displayImg(img=(webai.res.loadImg('mleft.jpg')))
    sleep(0.1)
    view.displayImg(img=(webai.res.loadImg('mright.jpg')))
    sleep(1.5)
  
    sleep(0.001)
except Exception as e:
  from webai_blockly import Lcd
  view = Lcd()
  view.clear()
  log = str(e)
  data_len, i, colume = 30, 0, 0
  while i < len(log):
    view.draw_string(50, 100 + (colume * 20), (log[i : i + data_len] + '\n'), 0x00F8, 0x0000)
    i = i + data_len
    colume = colume + 1