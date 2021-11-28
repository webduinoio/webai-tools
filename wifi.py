from Maix import utils
import ujson

class cfg:
  def init():
    cfg.flag = 0x4000
    cfg.length = 0x4002
    cfg.data = 0x4004     # 16388
    cfg.blobData = 0x10000  # 65536~
    id = utils.flash_read(cfg.flag,2)
    if id[0] != 119 or id[1] != 97: 
      utils.flash_write(cfg.flag,bytearray([119,97]))
      cfg.save({})
    else:
      dataLen = utils.flash_read(cfg.length,2)
      cfg.size = dataLen[0]*0x100 + dataLen[1]

  def load():
    jsonData = utils.flash_read(cfg.data,cfg.size)
    try:
      cfg.size = len(jsonData)
      return ujson.loads(jsonData)
    except:
      raise Exception("parse error:"+ str(jsonData))

  def save(obj):
    jsonData = ujson.dumps(obj)
    cfg.size = len(jsonData.encode())
    hi = cfg.size // 256
    lo = cfg.size % 256
    utils.flash_write(cfg.length,bytearray([hi,lo]))
    utils.flash_write(cfg.data,jsonData.encode())
    print("save",cfg.size,"bytes")

  def get(key):
    obj = cfg.load()
    if(not key in obj):
      val = None
    else:
      val = obj[key]
    obj = None
    del obj
    return val

  def put(key,value):
    obj = cfg.load()
    obj[key] = value
    cfg.save(obj)
    obj = None
    del obj
