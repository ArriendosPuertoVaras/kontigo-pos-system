import * as XLSX from 'xlsx';
import fs from 'fs';

// Mock the browser globals for the test to work in Node
global.Blob = class Blob {
    constructor(content, options) {
        this.content = content;
        this.options = options;
    }
}
global.URL = {
    createObjectURL: () => 'mock-url'
};
global.document = {
    createElement: () => ({
        setAttribute: () => { },
        style: {},
        click: () => { },
    }),
    body: {
        appendChild: () => { },
        removeChild: () => { }
    }
};

// --- Copy of the logic to test (simplified adaption) ---

const TEMPLATES = {
    staff: [
        { name: "Juan Perez", role: "Cocina", pin: "1234", type: "monthly", salary: "500000" },
        { name: "Maria Gonzalez", role: "Garzón", pin: "5678", type: "hourly", salary: "2500" }
    ]
};

function testDownload() {
    console.log("Testing Download/Generation...");
    const data = TEMPLATES.staff;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

    // In Node we can verify by writing to disk
    XLSX.writeFile(workbook, "test_template_staff.xlsx");
    console.log("✅ Written test_template_staff.xlsx");
}

function testParse() {
    console.log("Testing Parse...");
    try {
        const fileBuffer = fs.readFileSync("test_template_staff.xlsx");
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        console.log("Parsed Data:", jsonData);

        if (jsonData.length === 2 && jsonData[0].name === "Juan Perez") {
            console.log("✅ Parse successful: Data matches expected.");
        } else {
            console.error("❌ Parse failed: Data mismatch.");
            process.exit(1);
        }
    } catch (e) {
        console.error("❌ Parse failed with error:", e);
        process.exit(1);
    }
}

// Run
testDownload();
testParse();

// Cleanup
try {
    fs.unlinkSync("test_template_staff.xlsx");
    console.log("✅ Cleanup done.");
} catch (e) { }
