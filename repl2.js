const generateUploadCode = (type, file, pythonCode) => {
  code = `
pycode = """
${pythonCode}
"""
from Maix import utils
import gc, machine, ujson

# write python code
with open('${file}', 'w') as f:
    f.write(pycode)
with open ('${file}', 'r') as f:
    content = f.read()
    #print(content)
    print(len(content), 'bytes')
    

# save firmware type
romFlagAddressStart = 0x1FFFF
preFlag = int.from_bytes(utils.flash_read(romFlagAddressStart, 1), "big")
romFlag = 1 if "${type}" == "mini" else 0
if preFlag != romFlag:
    utils.flash_write(romFlagAddressStart, bytes([romFlag]))

deployCmd = "_DEPLOY/{\\"url\\": \\"local\\"}"

# save command
cfg.init()
cfg.put('cmd', deployCmd)
machine.reset()
`.replace("\\", "\\\\");

  return code;
};

class REPL {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.callback = function () {}
    this.ondisconnect = function () {}
    this.readState = 0;
  }

  addListener(callback) {
    this.callback = callback;
  }

  async connectBoard() {
    const filter = { usbVendorId: 6790 };
    if (this.port != undefined) {
      await this.writer.close();
      await this.reader.cancel();
      await this.port.close();
    } else {
      this.port = await navigator.serial.requestPort({ filters: [filter] });
      this.port.ondisconnect = this.ondisconnect;
    }
    await this.port.open({
      baudRate: 115200,
      dateBits: 8,
      stopBits: 1,
    });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    var self = this;
    self.resp = "";
    setTimeout(function () {
      self.readLoop(self);
    }, 10);
  }

  async readLoop(self) {
    try {
      while (true) {
        if (self.readState != 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        const { value, done } = await self.reader.read();
        self.resp += self.decoder.decode(value);
        self.callback(self.resp);
        self.resp = "";
        if (done) {
          self.reader.releaseLock();
          break;
        }
      }
    } catch (e) {}
  }

  async sendCmd(str) {
    await this.writer.write(Int8Array.from([0x01])); //start
    await this.writer.write(this.encoder.encode(str + "\r\n"));
    await this.writer.write(Int8Array.from([0x04])); //end
  }

  async writeLine(data) {
    await this.writer.write(this.encoder.encode(data + "\r\n"));
  }

  readLine(buf) {
    var text = ''
    for (var i = 0; i < buf.length; i++) {
      text += String.fromCharCode(buf[i])
      if (buf[i] == 0x0a) {
        break
      }
    }
    buf = buf.subarray(i + 1);
    return { text: text, buf: buf }
  }

  async readByteArray() {
    debugger;
    this.readyToRead = false
    var { value, done } = await this.reader.read();
    var { text, buf } = this.readLine(value)
    var bufSize = parseInt(text)
    var data = new Uint8Array(bufSize)
    console.log("text:", text, " ,buf:", buf.length, ",data:", buf)
    try {
      data.set(buf, 0)
    } catch (e) {
      throw ("text:" + text + " ,buf:" + buf.length)
    }
    var readSize = buf.length
    while (readSize < bufSize) {
      await new Promise(r => setTimeout(r, 20));
      //this.monitorRead(timeout);
      var { value, done } = await this.reader.read();
      data.set(value, readSize)
      readSize += value.length
    }
    this.readyToRead = true
    return data
  }

  async test() {
    this.readState = 1;
    for (var i = 0; i < 100; i++) {
      this.reader.read();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await this.sendCmd("print(5)");
    await this.sendCmd("print('Hello')");
    var value = await this.readByteArray()
    console.log("value:", value);
  }

  async snapshot() {
    var imgData = new Uint8Array(0);
    await this.writeLine("print(123)");
    var value = await this.readByteArray()
    return new Blob([value], { type: "image/jpeg" });
  }

  async restart() {
    await this.port.setSignals({ dataTerminalReady: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.port.setSignals({ dataTerminalReady: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  async enterRAWREPL() {
    await this.restart();
    await this.writer.write(Int8Array.from([
      [0x03]
    ]));
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async waitResponse(msg, retryLimit = 100) {
    while (--retryLimit > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (this.resp.indexOf(msg) >= 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        //console.log(this.resp);
        this.resp = "";
        return true;
      }
    }
    return false;
  }

  async waitWriteCompleted(file, msg) {
    var retryLimit = 1000;
    while (--retryLimit > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (this.resp.indexOf("f.write") >= 0) {
        if (this.resp.split("\n").length != 3) {
          continue;
        }
        var size = this.resp.split("\n")[1].trim();
        console.log("upload file:", file, " ,size:", size);
        this.resp = "";
        return size;
      }
    }
    return 0;
  }

  async uploadFile(type, filename, pythonCode) {
    /**
     * type: std|mini
     */
    console.log("upload file...");
    await this.writer.write(Int8Array.from([0x03, 0x0d, 0x0a, 0x01])); //start
    await this.writer.write(
      this.encoder.encode(generateUploadCode(type, filename, pythonCode))
    );
    await this.writer.write(Int8Array.from([0x04, 0x0d, 0x0a, 0x02])); //end
    await this.waitResponse("save", 1000);
  }

  async setWiFi(pythonCode, ssid, pwd) {
    pythonCode = 'code="""\n' + pythonCode + '\n"""';
    pythonCode = pythonCode.replace("\\", "\\\\");
    await this.writer.write(this.encoder.encode(pythonCode + "\x04"));
    await this.waitResponse("OK");
    await this.writer.write(Int16Array.from([0x13, 0x02]));
    await this.waitResponse("WebAI with kendryte-k210");
    await this.sendCmd("cfg.init()");
    await this.waitResponse("cfg.init()");
    await this.sendCmd(
      "cfg.put('wifi',{'ssid':'" + ssid + "','pwd':'" + pwd + "'})"
    );
    return this.waitResponse("save", 500);
  }
}

console.log("load repl OKOK.....");