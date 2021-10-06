import struct from "./lib/struct.mjs";
import ISP_PROG from "./lib/isp.js";

const delay = async(sec) => new Promise((r) => setTimeout(r, sec * 1000));
const generateUploadCode = (type, file, pythonCode) => {
    const code = `
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

deployCmd = '_DEPLOY/{\\"url\\": \\"local\\"}'

# save command
cfg.init()
cfg.put('cmd', deployCmd)
machine.reset()
`.replace("\\", "\\\\");
  
    return code;
};

class Port {
    async init() {
        const serial = navigator.serial;
        const filter = { usbVendorId: 6790 };
        this.serialPort = await serial.requestPort({ filters: [filter] });
        const speed = 115200 * 1;
        await this.serialPort.open({
            baudRate: speed,
            bufferSize: 256 * 1024
        });
        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
    }

    async changeBaud(speed) {
        await this.close();
        await this.serialPort.open({
            baudRate: speed
        });
        await this.openReader();
        await this.openWriter();
    }

    async close() {
        this.releaseReader();
        this.releaseWriter();
        await this.serialPort.close();
    }

    async openReader() {
        this.reader = await this.serialPort.readable.getReader();
        return this.reader;
    }

    async releaseReader() {
        await this.reader.releaseLock();
    }

    async openWriter() {
        this.writer = await this.serialPort.writable.getWriter();
        return this.writer;
    }

    async releaseWriter() {
        await this.writer.releaseLock();
    }

    async setDTR(value) {
        await this.serialPort.setSignals({ dataTerminalReady: value });
    }

    async setRTS(value) {
        await this.serialPort.setSignals({ requestToSend: value });
    }
}

class KFlash {
    async requestSerialPort() {
        if (!this.port){
            this.port = new Port();
            await this.port.init();
            await this.port.openReader();
            await this.port.openWriter();
            
            this.resp = "";
            setTimeout( async () => {
                await this.readLoop();
            }, 10);
        }
    }
    async setBaudRate(baudrate = 2000000) {
        this.baudRate = baudrate
    }
    async write(address, blob, listener) {
        this.initReadLoop = false
        const _port = this.port;
        const ISP_RECEIVE_TIMEOUT = 2;
        const MAX_RETRY_TIMES = 20;
        const ISP_FLASH_SECTOR_SIZE = 4096;
        const ISP_FLASH_DATA_FRAME_SIZE = ISP_FLASH_SECTOR_SIZE * 16;
        const isp_bytearray = ISP_PROG.match(/.{1,2}/g).map((e) => parseInt(e, 16));
        const isp_compressed = pako.inflate(new Uint8Array(isp_bytearray));

        class ISPResponse {
            static ISPOperation = {
                ISP_ECHO: 0xc1,
                ISP_NOP: 0xc2,
                ISP_MEMORY_WRITE: 0xc3,
                ISP_MEMORY_READ: 0xc4,
                ISP_MEMORY_BOOT: 0xc5,
                ISP_DEBUG_INFO: 0xd1,
                ISP_CHANGE_BAUDRATE: 0xc6,
            };

            static ErrorCode = {
                ISP_RET_DEFAULT: 0,
                ISP_RET_OK: 0xe0,
                ISP_RET_BAD_DATA_LEN: 0xe1,
                ISP_RET_BAD_DATA_CHECKSUM: 0xe2,
                ISP_RET_INVALID_COMMAND: 0xe3,
            };

            static parse(data) {
                // console.log("ISPResponse parse", data);
                let op = parseInt(data[0]);
                let reason = parseInt(data[1]);
                let text = "";

                try {
                    for (let code in ISPResponse.ISPOperation) {
                        if (
                            ISPResponse.ISPOperation[code] === op &&
                            ISPResponse.ISPOperation.ISP_DEBUG_INFO
                        )
                            text = String.fromCharCode(...text.slice(2));
                    }
                } catch (e) {
                    console.log(e);
                }

                return [op, reason, text];
            }
        }

        class FlashModeResponse {
            static Operation = {
                ISP_DEBUG_INFO: 0xd1,
                ISP_NOP: 0xd2,
                ISP_FLASH_ERASE: 0xd3,
                ISP_FLASH_WRITE: 0xd4,
                ISP_REBOOT: 0xd5,
                ISP_UARTHS_BAUDRATE_SET: 0xd6,
                FLASHMODE_FLASH_INIT: 0xd7,
            };

            static ErrorCode = {
                ISP_RET_DEFAULT: 0x00,
                ISP_RET_OK: 0xe0,
                ISP_RET_BAD_DATA_LEN: 0xe1,
                ISP_RET_BAD_DATA_CHECKSUM: 0xe2,
                ISP_RET_INVALID_COMMAND: 0xe3,
                ISP_RET_BAD_INITIALIZATION: 0xe4,
            };

            static parse(data) {
                console.log(
                    "FlashModeResponse parse",
                    data.map((e) => e.toString(16))
                );
                let op = parseInt(data[0]);
                let reason = parseInt(data[1]);
                let text = "";

                if (op === FlashModeResponse.Operation.ISP_DEBUG_INFO)
                    text = String.fromCharCode(...text.slice(2));
                return [op, reason, text];
            }
        }

        class MAIXLoader {
            async write(packet) {
                let handlePacket = [];

                packet.forEach((e) => {
                    if (e === 0xc0) handlePacket.push(0xdb, 0xdc);
                    else if (e === 0xdb) handlePacket.push(0xdb, 0xdd);
                    else handlePacket.push(e);
                });

                // console.log([0xc0, ...handlePacket, 0xc0].map((e) => e.toString(16)));
                // console.log([0xc0, ...handlePacket, 0xc0].length);
                const uint8 = new Uint8Array([0xc0, ...handlePacket, 0xc0]);
                await _port.writer.write(uint8);
            }

            async reset_to_isp() {
                await _port.setDTR(0);
                await _port.setRTS(0);
                await delay(0.1);

                // console.log('-- RESET to LOW, IO16 to HIGH --')
                // Pull reset down and keep 10ms
                await _port.setDTR(0);
                await _port.setRTS(1);
                await delay(0.1);

                // console.log('-- IO16 to LOW, RESET to HIGH --')
                // Pull IO16 to low and release reset
                await _port.setDTR(1);
                await _port.setRTS(0);
                await delay(0.1);
            }

            async reset_to_boot() {
                await _port.setDTR(0);
                await _port.setRTS(0);
                await delay(0.1);

                // console.log('-- RESET to LOW --')
                // Pull reset down and keep 10ms
                await _port.setDTR(0);
                await _port.setRTS(1);
                await delay(0.1);

                // console.log('-- RESET to HIGH, BOOT --')
                // Pull IO16 to low and release reset
                await _port.setRTS(0);
                await _port.setDTR(0);
                await delay(0.1);
            }

            async recv_one_return() {
                const timeout_init = Date.now() / 1000;
                while (true) {
                    if (Date.now / 1000 - timeout_init > ISP_RECEIVE_TIMEOUT)
                        throw "TimeoutError";
                    const { value, done } = await _port.reader.read();
                    const buf = Array.from(value);

                    let data = [];
                    let in_escape = false;
                    let start = false;
                    let i = 0;

                    // Serial Line Internet Protocol
                    while (i < buf.length) {
                        const c = buf[i++];

                        if (c === 0xc0) {
                            buf.slice(i, buf.length);
                            start = true;
                            break;
                        }
                    }

                    if (!start) continue;

                    i = 0;

                    while (i < buf.length) {
                        const c = buf[++i];

                        if (c === 0xc0) break;
                        else if (in_escape) {
                            in_escape = true;
                            if (c === 0xdc) data.push(0xc0);
                            else if (c === 0xdd) data.push(0xdb);
                            else throw "Invalid SLIP escape";
                        } else if (c === 0xdb) in_escape = true;

                        data.push(c);
                    }

                    // console.log(
                    //   data.map((e) => `0x${e.toString(16)}`),
                    //   done
                    // );
                    return data;
                }
            }

            async recv_debug() {
                const resp = await this.recv_one_return();
                const result = ISPResponse.parse(resp);
                const op = result[0];
                const reason = result[1];
                const text = result[2];
                if (text) {
                    console.log("---");
                    console.log(text);
                    console.log("---");
                }
                // console.log(op.toString(16), reason.toString(16), text);
                if (
                    reason !== ISPResponse.ErrorCode.ISP_RET_DEFAULT &&
                    reason !== ISPResponse.ErrorCode.ISP_RET_OK
                ) {
                    console.log(`Failed, retry, errcode= 0x${reason.toString(16)}`);
                    return false;
                }
                return true;
            }

            async greeting() {
                console.log("greeting....");
                await _port.writer.write(
                    new Uint8Array([
                        0xc0, 0xc2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                        0x00, 0x00, 0x00, 0xc0,
                    ])
                );
                ISPResponse.parse(await this.recv_one_return());
            }

            async flash_greeting() {
                retry_count = 0;
                while (true) {
                    await _port.writer.write(
                        new Uint8Array([
                            0xc0, 0xd2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                            0x00, 0x00, 0x00, 0xc0,
                        ])
                    );
                    retry_count++;

                    let op = 0;
                    let reason = 0;
                    let text = "";

                    try {
                        const result = FlashModeResponse.parse(
                            await this.recv_one_return()
                        );
                        op = result[0];
                        reason = result[1];
                        text = result[2];
                    } catch (e) {
                        console.log("Failed to Connect to K210's Stub");
                        await delay(0.1);
                        continue;
                    }

                    if (
                        op === FlashModeResponse.Operation.ISP_NOP &&
                        reason === FlashModeResponse.ErrorCode.ISP_RET_OK
                    ) {
                        console.log("Boot to Flashmode Successful");
                        // TODO: flush buffer
                        break;
                    } else {
                        if (retry_count > MAX_RETRY_TIMES) {
                            console.log("Failed to Connect to K210's Stub");
                            throw "FlashStubError";
                        }
                        console.log("Unexpecpted Return recevied, retrying...");
                        await delay(0.1);
                    }
                }
            }

            async flash_dataframe(data, address = 0x80000000, listener) {
                const DATAFRAME_SIZE = 1024;
                data = Array.from(data);
                var totalSize = data.length;
                var nowSize = 0;
                while (data.length) {
                    const chunk = data.splice(0, DATAFRAME_SIZE);
                    while (true) {
                        const op_p = new Uint8Array(
                            struct("<HH").pack(
                                ISPResponse.ISPOperation.ISP_MEMORY_WRITE,
                                0x00
                            )
                        );
                        const address_p = new Uint8Array(
                            struct("<II").pack(address, chunk.length)
                        );

                        const crc32_checksum = new Uint8Array(
                            struct("<I").pack(
                                crc.crc32([...address_p, ...chunk]) & 0xffffffff
                            )
                        );

                        let packet = [...op_p, ...crc32_checksum, ...address_p, ...chunk];

                        // console.log(packet);
                        // console.log(packet.map((e) => e.toString(16)));
                        // console.log("write", `0x${address.toString(16)}`, packet.length);
                        await delay(0.1);
                        await this.write(packet);
                        await _port.writer.releaseLock()
                        await _port.openWriter()
                        if (await this.recv_debug()) {
                            address += DATAFRAME_SIZE;
                            nowSize += DATAFRAME_SIZE;
                            listener(parseInt(nowSize / totalSize * 10));
                            break;
                        }
                    }
                }
                console.log(`Downlaod ISP OK`);
            }

            async install_flash_bootloader(data, listener) {
                await this.flash_dataframe(data, 0x80000000, listener);
            }

            async change_baudrate(baudrate = 2000000) {
                console.log("Selected Baudrate:", baudrate);
                const baudrate_p = new Uint8Array(struct("<III").pack(0, 4, baudrate));
                const crc32_checksum = new Uint8Array(
                    struct("<I").pack(crc.crc32(baudrate_p) & 0xffffffff)
                );
                const op_p = new Uint8Array(
                    struct("<HH").pack(
                        FlashModeResponse.Operation.ISP_UARTHS_BAUDRATE_SET,
                        0x00
                    )
                );
                const packet = [...op_p, ...crc32_checksum, ...baudrate_p];
                await this.write(packet);
                await delay(0.05);
                await _port.changeBaud(baudrate);
            }

            async boot(address = 0x80000000) {
                console.log("Booting From", `0x${address.toString(16)}`);

                const address_p = new Uint8Array(struct("<II").pack(address, 0));
                const crc32_checksum = new Uint8Array(
                    struct("<I").pack(crc.crc32(address_p) & 0xffffffff)
                );
                const op_p = new Uint8Array(
                    struct("<HH").pack(ISPResponse.ISPOperation.ISP_MEMORY_BOOT, 0x00)
                );
                const packet = new Uint8Array([
                    ...op_p,
                    ...crc32_checksum,
                    ...address_p,
                ]);
                console.log(packet, packet.length);
                await this.write(packet);
            }

            async init_flash(chip_type = 1) {
                const chip_type_p = new Uint8Array(struct("<II").pack(chip_type, 0));
                const crc32_checksum = new Uint8Array(
                    struct("<I").pack(crc.crc32(chip_type_p) & 0xffffffff)
                );
                const op_p = new Uint8Array(
                    struct("<HH").pack(
                        FlashModeResponse.Operation.FLASHMODE_FLASH_INIT,
                        0x0
                    )
                );
                const packet = [...op_p, ...crc32_checksum, ...chip_type_p];
                let retry_count = 0;
                let op = 0;
                let reason = 0;

                while (true) {
                    await this.write(packet);
                    retry_count++;
                    console.log('retry..', retry_count)
                    try {
                        const result = FlashModeResponse.parse(
                            await this.recv_one_return()
                        );
                        op = result[0];
                        reason = result[1];
                    } catch (e) {
                        console.log("Failed to initialize flash", e);
                        continue
                    }

                    if (
                        op === FlashModeResponse.Operation.FLASHMODE_FLASH_INIT &&
                        reason === FlashModeResponse.ErrorCode.ISP_RET_OK
                    ) {
                        console.log("Initialization flash Successfully");
                        break;
                    } else {
                        if (retry_count > MAX_RETRY_TIMES) {
                            console.log("Failed to initialize flash");
                            throw "InitialFlashError";
                        }
                        console.log("Unexcepted Return recevied, retrying...");
                        await delay(0.1);
                    }
                }
            }

            async flash_firmware(firmware_bin, address = 0, listener) {
                if (firmware_bin instanceof Blob) {
                    firmware_bin = await firmware_bin.arrayBuffer();
                }
                firmware_bin = Array.from(new Uint8Array(firmware_bin));
                var totalSize = firmware_bin.length;
                var nowSize = 0;
                while (firmware_bin.length) {
                    const chunk = firmware_bin.splice(0, ISP_FLASH_DATA_FRAME_SIZE);

                    while (chunk.length < ISP_FLASH_DATA_FRAME_SIZE) {
                        chunk.push(0);
                    }

                    while (true) {
                        const op_p = new Uint8Array(
                            struct("<HH").pack(
                                FlashModeResponse.Operation.ISP_FLASH_WRITE,
                                0x00
                            )
                        );
                        const address_p = new Uint8Array(
                            struct("<II").pack(address, chunk.length)
                        );

                        const crc32_checksum = new Uint8Array(
                            struct("<I").pack(
                                crc.crc32([...address_p, ...chunk]) & 0xffffffff
                            )
                        );
                        let packet = [...op_p, ...crc32_checksum, ...address_p, ...chunk];
                        // console.log(packet);
                        // console.log(packet.map((e) => e.toString(16)));
                        // console.log("write", `0x${address.toString(16)}`);
                        await this.write(packet);
                        if (await this.recv_debug()) {
                            nowSize += chunk.length;
                            address += ISP_FLASH_DATA_FRAME_SIZE;
                            var percent = parseInt(parseInt(nowSize / totalSize * 10000) / 110)
                            listener(percent + 10);
                            break;
                        }
                    }
                }
                await delay(0.5);
                console.log(`Burn Firmware OK`);
            }
        }

        // init
        this.loader = new MAIXLoader();

        // 1. Greeting
        console.log("Trying to Enter the ISP Mode...");
        let retry_count = 0;
        while (true) {
            try {
                retry_count += 1;
                if (retry_count > 15) {
                    console.log(
                        "[ERROR]",
                        "No vaild Kendryte K210 found in Auto Detect, Check Your Connection or Specify One by"
                    );
                }
                try {
                    console.log(".");
                    await this.loader.reset_to_isp();
                    await this.loader.greeting();
                    break;
                } catch {
                    console.log("timeouterror");
                }
            } catch {
                console.log("Greeting fail, check serial port");
            }
        }

        // 2. download bootloader and firmware
        console.log("download bootloader and firmware");
        await this.loader.install_flash_bootloader(isp_compressed, listener);

        // Boot the code from SRAM
        await this.loader.boot();

        console.log("Wait For 0.1 second for ISP to Boot");
        await delay(0.1);

        console.log("flash_greeting");
        await this.loader.flash_greeting();

        console.log("change_baudrate");
        await this.loader.change_baudrate(this.baudRate);
        console.log("flash_greeting");
        await this.loader.flash_greeting();
        console.log("init_flash");
        await this.loader.init_flash();

        console.log("flash_firmware");
        await this.loader.flash_firmware(blob, address, listener);

        // 3. boot
        await this.loader.reset_to_boot();
        await this.loader.change_baudrate(115200);
        console.log("Rebooting...");
    }
    async restart() {
        await this.port.setDTR(0);
        await delay(0.1)
        await this.port.setDTR(1);
        await delay(2)
    }
    async enterRAWREPL() {
        console.log("enterREPL...");
        this.changeBaud
        this.initReadLoop = true
        await this.restart();
        await this.port.writer.write(Int8Array.from([[0x03]]));
        await delay(0.5)
    }

    async waitResponse(msg, retryLimit = 100) {
        while (--retryLimit > 0) {
          await delay(0.01)
          if (this.resp.indexOf(msg) >= 0) {
            await delay(0.1)
            this.resp = "";
            return true;
          }
        }
        return false;
    }

    
    async readLoop() {
        while (true) {
          if (!this.initReadLoop) return 
          const { value, done } = await this.port.reader.read();
          this.resp += this.port.textDecoder.decode(value);
          console.log(this.resp)
          if (done) {
            this.port.reader.releaseLock();
            break;
          }
        }
    }

    async uploadFile(type, filename, pythonCode) {
        /**
         * type: std|mini
         */
        console.log("upload file...");
        await this.port.writer.write(Int8Array.from([0x03, 0x0d, 0x0a, 0x01])); //start
        await this.port.writer.write(
          this.port.textEncoder.encode(generateUploadCode(type, filename, pythonCode))
        );
        await this.port.writer.write(Int8Array.from([0x04, 0x0d, 0x0a, 0x02])); //end
        await this.waitResponse("save", 1000);
    }

}

const kflash = new KFlash();
export default kflash;