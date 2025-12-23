import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './utils'; // Assuming you have a formatter, otherwise we'll define a local one
import { SalaryResult } from './payroll/chile';
import { Staff } from './db';

const formatCLP = (amount: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
};

interface SettlementData {
    staff: Staff;
    salary: SalaryResult;
    period: {
        month: string;
        year: number;
        startDate: string;
        endDate: string;
    };
    company: {
        name: string;
        rut: string;
        address: string;
    }
}

export const generateSalarySettlementPDF = (data: SettlementData): Blob => {
    const doc = new jsPDF();
    const { staff, salary, period, company } = data;

    // --- HEADING ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("LIQUIDACION DE REMUNERACION MENSUAL", 105, 20, { align: "center" });

    // --- COMPANY & WORKER INFO ---
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    // Left Column (Labels)
    const leftX = 15;
    const leftValX = 50;

    doc.text("Empleador", leftX, 40);
    doc.text(":", leftX + 25, 40);
    doc.text(company.name.toUpperCase(), leftValX, 40);

    doc.text("Nombre", leftX, 47);
    doc.text(":", leftX + 25, 47);
    doc.text(staff.name.toUpperCase(), leftValX, 47);

    doc.text("R.U.T.", leftX, 54);
    doc.text(":", leftX + 25, 54);
    doc.text(staff.rut || "SIN RUT", leftValX, 54);

    doc.text("Fecha de Ingreso", leftX, 61);
    doc.text(":", leftX + 25, 61);
    doc.text(staff.startDate ? new Date(staff.startDate).toLocaleDateString('es-CL') : "-", leftValX, 61);

    // Box for Totals Reference (Visual only as per image)
    doc.setDrawColor(0);
    doc.setLineDash([1, 1], 0);
    doc.rect(leftX - 2, 66, 90, 15); // Box x, y, w, h
    doc.text("Rta Tributable", leftX, 71);
    doc.text(formatCLP(salary.totalImponible), 70, 71); // Approx placement
    doc.text("Rta Imponible", leftX, 77);
    doc.text(formatCLP(salary.totalImponible), 70, 77);
    doc.setLineDash([], 0); // Reset dash

    // Right Column
    const rightX = 110;
    const rightValX = 145;

    doc.text("R.U.T.", rightX, 40);
    doc.text(":", rightX + 25, 40);
    doc.text(company.rut, rightValX, 40);

    doc.text("Mes", rightX, 47);
    doc.text(":", rightX + 25, 47);
    doc.text(`${period.month.toUpperCase()} de ${period.year}`, rightValX, 47);

    doc.text("AFP", rightX, 61);
    doc.text(":", rightX + 25, 61);
    doc.text((salary.descuentosTrabajador.afpNombre || "").toUpperCase(), rightValX, 61);

    doc.text("Inst. Salud", rightX, 68);
    doc.text(":", rightX + 25, 68);
    doc.text((staff.healthSystem || "").toUpperCase(), rightValX, 68);

    doc.text("Días Trabajados", rightX, 75);
    doc.text(":", rightX + 25, 75);
    doc.text("30", rightValX, 75); // Assuming 30 for monthly

    doc.text("Cargo", rightX, 82);
    doc.text(":", rightX + 25, 82);
    doc.text((staff.activeRole || "").toUpperCase(), rightValX, 82);

    doc.line(10, 88, 200, 88); // Horizontal Separator

    // --- BODY: HABERES & DESCUENTOS ---
    const startY = 95;

    // Headers
    doc.setFont("helvetica", "bold");
    doc.text("HABERES", 70, startY, { align: "right" });
    doc.text("Detalle Imposiciones", 110, startY);

    doc.setFont("helvetica", "normal");

    let currentY = startY + 8;
    const lineHeight = 6;

    // -- HABERES (Left side) --
    // Sueldo Base
    doc.text("Sueldo Base", leftX, currentY);
    doc.text(formatCLP(salary.sueldoBase), 90, currentY, { align: "right" });

    // Gratificación
    currentY += lineHeight;
    doc.text("Gratificación Legal", leftX, currentY);
    doc.text(formatCLP(salary.gratificacion), 90, currentY, { align: "right" });

    // Totals Line for Haberes Imponibles
    currentY += lineHeight * 3; // Spacer
    doc.setFont("helvetica", "bold");
    doc.setLineWidth(0.5);
    doc.line(leftX, currentY - 4, 95, currentY - 4);
    doc.text("Total Haber Imp. y Tributab", leftX, currentY);
    doc.text(formatCLP(salary.totalImponible), 90, currentY, { align: "right" });
    doc.setLineWidth(0.1);
    doc.setFont("helvetica", "normal");

    // -- DESCUENTOS (Right side) --
    currentY = startY + 8; // Reset Y for right column

    // AFP
    doc.text("AFP", 110, currentY);
    doc.text("11.44%", 160, currentY, { align: "right" }); // TODO: Pass exact rate
    doc.text(formatCLP(salary.descuentosTrabajador.afpMonto), 195, currentY, { align: "right" });

    // Salud
    currentY += lineHeight;
    doc.text("Salud", 110, currentY);
    doc.text("7.00%", 160, currentY, { align: "right" }); // TODO: Pass exact rate
    doc.text(formatCLP(salary.descuentosTrabajador.saludMonto), 195, currentY, { align: "right" });

    // Seguro Cesantía
    currentY += lineHeight;
    doc.text("Seguro Desempleo", 110, currentY);
    doc.text(staff.contractDuration === 'indefinite' ? "0.60%" : "0.00%", 160, currentY, { align: "right" });
    doc.text(formatCLP(salary.descuentosTrabajador.cesantiaMonto), 195, currentY, { align: "right" });

    // Impuesto
    currentY += lineHeight;
    if (salary.descuentosTrabajador.impuestoUnico > 0) {
        doc.text("Impuesto Unico", 110, currentY);
        doc.text(formatCLP(salary.descuentosTrabajador.impuestoUnico), 195, currentY, { align: "right" });
    }

    // Totals Line for Descuentos Legales
    currentY = startY + (lineHeight * 4); // Sync Y
    doc.setFont("helvetica", "bold");
    doc.setLineWidth(0.5);
    doc.line(110, currentY - 4, 200, currentY - 4);
    doc.text("Total Descuentos Legales", 110, currentY);
    doc.text(formatCLP(salary.descuentosTrabajador.total), 195, currentY, { align: "right" });
    doc.setLineWidth(0.1);
    doc.setFont("helvetica", "normal");

    // --- NO IMPONIBLES (Left) ---
    currentY += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Haberes No Imponibles, No Tributables", leftX, currentY);
    doc.setFont("helvetica", "normal");

    currentY += 8;
    doc.text("Movilización", leftX, currentY);
    doc.text(formatCLP(salary.haberesNoImponibles.movilizacion), 90, currentY, { align: "right" });

    currentY += lineHeight;
    doc.text("Colación", leftX, currentY);
    doc.text(formatCLP(salary.haberesNoImponibles.colacion), 90, currentY, { align: "right" });

    // Total No Imponibles
    currentY += lineHeight * 2;
    doc.setFont("helvetica", "bold");
    doc.setLineWidth(0.5);
    doc.line(leftX, currentY - 4, 95, currentY - 4);
    doc.text("Totales Haberes No Imp. N", leftX, currentY);
    doc.text(formatCLP(salary.haberesNoImponibles.total), 90, currentY, { align: "right" });

    // --- TOTAL FINAL ---
    currentY += 15;
    doc.setLineWidth(0.5);
    doc.text("TOTAL HABER", leftX, currentY);
    doc.text(formatCLP(salary.totalImponible + salary.haberesNoImponibles.total), 90, currentY, { align: "right" });
    doc.line(leftX, currentY + 2, 95, currentY + 2);

    doc.text("Liquido", 110, currentY);
    doc.text(formatCLP(salary.sueldoLiquidoEstimado), 195, currentY, { align: "right" });
    doc.line(110, currentY + 2, 200, currentY + 2);

    // --- FOOTER / SIGNATURE ---
    const bottomY = 240;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    doc.text("Certifico que he recibido de : " + company.name.toUpperCase() + ", a mi entera satisfacción, el saldo líquido indicado", leftX, bottomY - 20);
    doc.text("en la presente liquidación y no tengo cargo ni cobro posterior que hacer.", leftX, bottomY - 16);

    doc.line(120, bottomY, 180, bottomY);
    doc.text("Firma del Trabajador", 135, bottomY + 5);
    doc.text(`R.U.T.: ${staff.rut || ""}`, 135, bottomY + 10);

    return doc.output('blob');
};
