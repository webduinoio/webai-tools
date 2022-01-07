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
