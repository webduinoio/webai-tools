class REPL {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  async connectBoard() {
    const filter = { usbVendorId: 6790 };
    if (this.port != undefined) {
      //console.log("reconnect..")
      await this.writer.close();
      await this.reader.cancel();
      await this.port.close();
    } else {
      //console.log("connect..")
      this.port = await navigator.serial.requestPort({ filters: [filter] });
    }
    await this.port.open({
      baudRate: 115200,
      dateBits: 8,
      stopBits: 1
    });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    var self = this;
    self.resp = ''
    setTimeout(function () {
      self.readLoop(self);
    }, 10)
  }

  async readLoop(self) {
    while (true) {
      const { value, done } = await self.reader.read();
      self.resp += self.decoder.decode(value);
      if (done) {
        self.reader.releaseLock();
        break;
      }
    }
  }

  async sendCmd(str) {
    await this.writer.write(this.encoder.encode(str + '\r\n'));
  }

  async restart() {
    await this.port.setSignals({ dataTerminalReady: false });
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.port.setSignals({ dataTerminalReady: true });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async enterRAWREPL() {
    do {
      console.log("enterREPL....");
      await this.restart();
      for (var i = 0; i < 50; i++) {
        await this.writer.write(Int16Array.from([0x13, 0x03, 0x03]));
      }
      await this.writer.write(Int16Array.from([0x13, 0x01]));
      await this.waitResponse("raw REPL; CTRL-B to exit");
      await this.writer.write(this.encoder.encode("\x05A\x01"));
    } while (false == await this.waitResponse("raw REPL; CTRL-B to exit"));
  }

  async waitResponse(msg, retryLimit = 100) {
    while (--retryLimit > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (this.resp.indexOf(msg) >= 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        //console.log(this.resp);
        this.resp = '';
        return true;
      }
    }
    return false;
  }

  async waitWriteCompleted(file, msg) {
    var retryLimit = 1000;
    while (--retryLimit > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (this.resp.indexOf("f.write") >= 0) {
        if (this.resp.split('\n').length != 3) {
          continue;
        }
        var size = this.resp.split('\n')[1].trim();
        console.log("upload file:", file, " ,size:", size);
        this.resp = '';
        return size;
      }
    }
    return 0;
  }

  async uploadFile(pythonCode, file) {
    pythonCode = 'code="""\n' + pythonCode + '\n"""';
    pythonCode = pythonCode.replace('\\', '\\\\');
    await this.writer.write(this.encoder.encode(pythonCode + "\x04"));
    await this.waitResponse("OK");
    await this.writer.write(Int16Array.from([0x13, 0x02]));
    await this.waitResponse("WebAI with kendryte-k210");
    await this.sendCmd('f = open("' + file + '","w")');
    await this.waitResponse("f = open(");
    await this.sendCmd('f.write(code)');
    var size = await this.waitWriteCompleted(file, "f.write(code)");
    await this.sendCmd('f.close()');
    await this.waitResponse("f.close()");
    return size;
  }


  async setWiFi(pythonCode,ssid,pwd) {
    pythonCode = 'code="""\n' + pythonCode + '\n"""';
    pythonCode = pythonCode.replace('\\', '\\\\');
    await this.writer.write(this.encoder.encode(pythonCode + "\x04"));
    await this.waitResponse("OK");
    await this.writer.write(Int16Array.from([0x13, 0x02]));
    await this.waitResponse("WebAI with kendryte-k210");
    await this.sendCmd('cfg.init()');
    await this.waitResponse("cfg.init()");
    await this.sendCmd("cfg.put('wifi',{'ssid':'" + ssid + "','pwd':'" + pwd + "'})");
    return this.waitResponse("save",500);
  }

}