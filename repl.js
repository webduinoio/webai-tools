const generateUploadCode = (type, file, pythonCode) => {
  code = `
pycode = """
${pythonCode}
"""
from Maix import utils
from time import sleep
import gc, machine, ujson
# write python code
with open('${file}', 'w') as f:
    f.write(pycode)
sleep(0.5)
with open ('${file}', 'r') as f:
    content = f.read()
# save firmware type
romFlagAddressStart = 0x1FFFF
preFlag = int.from_bytes(utils.flash_read(romFlagAddressStart, 1), "big")
romFlag = 1 if "${type}" == "mini" else 0
if preFlag != romFlag:
    utils.flash_write(romFlagAddressStart, bytes([romFlag]))
deployCmd = '_DEPLOY/{"url":"local"}'
cfg.init()
cfg.put('cmd', deployCmd)
`;
  return code;
};

const snapshotCode = `
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
repl.write('\\r\\n')
sleep(0.005)
repl.write(jpg)
`

class DataTransformer {
  constructor() {
    this.container = '';
    this.decoder = new TextDecoder();
    this.readLine = true;
  }

  setReadLine() {
    this.readLine = true;
    this.readByteArray = false;
  }

  setReadByteArray(bytes) {
    this.readLine = false;
    this.readByteArray = true;
    this.readBytes = bytes;
    this.byteArray = new Uint8Array();
  }

  transform(chunk, controller) {
    if (this.readLine) {
      chunk = this.decoder.decode(chunk);
      this.container += chunk;
      const lines = this.container.split('\r\n');
      this.container = lines.pop();
      lines.forEach(line => controller.enqueue(line));
    }
    if (this.readByteArray) {
      this.byteArray = new Uint8Array([...this.byteArray, ...chunk]);
      var byteArrayLength = this.byteArray.length;
      if (byteArrayLength >= this.readBytes) {
        var rtnByteArray = new Uint8Array([...this.byteArray.slice(0, this.readBytes)]);
        this.byteArray = new Uint8Array(
          [this.byteArray.slice(this.readBytes, byteArrayLength - this.readBytes)]);
        //console.log("chunk:", rtnByteArray);
        controller.enqueue(rtnByteArray);
      }
    }
  }

  flush(controller) {
    controller.enqueue(this.container);
  }
}

class REPL {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.callback = function () {}
  }

  addListener(callback) {
    this.callback = callback;
  }

  async usbConnect() {
    var self = this;
    const filter = { usbVendorId: 6790 };
    if (self.port == undefined) {
      self.port = await navigator.serial.requestPort({ filters: [filter] });
      await this.port.open({ baudRate: 115200, dateBits: 8, stopBits: 1, });
      this.writer = this.port.writable.getWriter();
      this.stream = new DataTransformer();
      this.reader = this.port.readable.
      pipeThrough(new TransformStream(this.stream)).getReader();
      self.port.ondisconnect = function () {
        console.log("disconnect port");
        self.port = null;
      }
    }
  }

  async restart() {
    await this.port.setSignals({ dataTerminalReady: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.port.setSignals({ dataTerminalReady: true });
    await new Promise((resolve) => setTimeout(resolve, 1700));
  }

  async enter() {
    console.log("restart...")
    await this.restart();
    for (var i = 0; i < 10; i++) {
      await this.writer.write(Int8Array.from([0x03 /*interrupt*/ ]));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.stream.setReadLine(true);
    while (true) {
      var { value, done } = await this.reader.read();
      //console.log("enter:",value)
      if (value == '>>> ') break;
    }
    console.log("REPL ready!");
  }

  async write(str) {
    await this.writer.write(Int8Array.from([0x01 /*RAW paste mode*/ ]));
    await this.writer.write(this.encoder.encode(str + '\r\n'));
    await this.writer.write(Int8Array.from([0x04 /*exit*/ ]));
    while (true) {
      var { value, done } = await this.reader.read();
      //console.log("#", value);
      if (value.indexOf('>OK') == 0) {
        value = value.substring(3);
        break;
      }
    }
    return value;
  }

  async writeAssert(str, rtn) {
    this.stream.setReadLine(true);
    await this.writer.write(Int8Array.from([0x01 /*RAW paste mode*/ ]));
    await this.writer.write(this.encoder.encode(str));
    await this.writer.write(Int8Array.from([0x04 /*exit*/ ]));
    var output = '';
    var flag = false;
    while (true) {
      var { value, done } = await this.reader.read();
      //console.log('#',value);
      if (value.indexOf('>OK') == 0) {
        flag = true;
        value = value.substring(3);
      }
      if(flag){
        output += value;
        if(output.indexOf(rtn)>=0) break;
      }
    }
    return value;
  }

  async uploadFile(type, filename, pythonCode) {
    pythonCode = generateUploadCode(type /*std|mini*/ , filename, pythonCode);
    pythonCode = pythonCode.replace("\\", "\\\\");
    return await this.writeAssert(pythonCode, "save");
  }

  async setWiFi(pythonCode, ssid, pwd) {
    pythonCode += "cfg.init()\n";
    pythonCode += "cfg.put('wifi',{'ssid':'" + ssid + "','pwd':'" + pwd + "'})\n";
    return this.writeAssert(pythonCode, 'save');
  }

  async snapshot(){
    var rtn = await repl.writeAssert(snapshotCode, 'JPGSize:');
    rtn = rtn.substring('JPGSize:'.length);
    repl.stream.setReadByteArray(parseInt(rtn));
    var { value, done } = await repl.reader.read();
    var jpg = new Blob([value], { type: "image/jpeg" });
    var urlCreator = window.URL || window.webkitURL;
    return urlCreator.createObjectURL(jpg);
  }

}