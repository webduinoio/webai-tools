try:
  from time import sleep
  from webai_blockly import Lcd
  import _thread
  
  try:
    from webai import *
  except:
    pass
  
  view = Lcd()
  
  def _hex_to_rgb(hex):
    h = hex.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
  
  def _rgb_to_hex565(rgb):
    (red, green, blue) = rgb
    hex565 = "0x%0.4X" % ((int(red / 255 * 31) << 11) | (int(green / 255 * 63) << 5) | (int(blue / 255 * 31)))
    board_hex = '0x' + hex565[4:] + hex565[2:4]
    return int(board_hex, 16)
  
  def _localTime(type):
    (Y, M, D, h, m, s, day, yearday) = time.localtime()
    localtimeObj = {
      "YMD": '%s/%02d/%02d' % (Y, M, D),
      "MDY": '%02d/%02d/%s' % (M, D, Y),
      "DMY": '%02d/%02d/%s' % (D, M, Y),
      "Y": Y,
      "M": '%02d' % M,
      "D": '%02d' % D,
      "hms": '%02d:%02d:%02d' % (h, m, s),
      "h": '%02d' % h,
      "m": '%02d' % m,
      "s": '%02d' % s
    }
    return localtimeObj[type]
  
  def _h50ufk99g():
  
    while True:
      view.drawRectangle(x=0, y=0, w=320, h=240, color=_rgb_to_hex565(_hex_to_rgb('#000000')), thickness=1, fill=True)
      view.drawString(x=50, y=110, text=b"{var}".format(var=(_localTime('YMD'))), color=_rgb_to_hex565(_hex_to_rgb('#cccccc')), scale=2, x_spacing=10, mono_space=False)
      view.drawString(x=70, y=170, text=b"{var}".format(var=(_localTime('hms'))), color=_rgb_to_hex565(_hex_to_rgb('#cccccc')), scale=2, x_spacing=12, mono_space=False)
      view.drawString(x=73, y=35, text=b"{var}".format(var='現在時間'), color=_rgb_to_hex565(_hex_to_rgb('#ffffff')), scale=2, x_spacing=30, mono_space=False)
      sleep(1)
  
      sleep(0.001)
  
  # RUN USB MODE
  _deviceID = 'dd9e86'
  try:
    print(_onServiceEvent)
    from time import sleep
    sleep(1)
    webai.mqtt.sub(topic=_deviceID + '/SERVICE', callback=_onServiceEvent)
  except:
    pass
  
  
  _thread.start_new_thread(_h50ufk99g, ())
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