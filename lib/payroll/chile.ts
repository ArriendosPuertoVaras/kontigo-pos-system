import { Staff, Shift } from '../db';

// --- CONSTANTS (Proyección 2025 / HORECA Expert) ---
const IMM_2025 = 529000; // Ingreso Mínimo Mensual Estimado
const TOPE_GRATIFICACION_MENSUAL = 209396; // 4.75 * IMM / 12
const TOPE_IMPONIBLE_UF = 84.3;
const VALOR_UF_REF = 38000; // Referencial

// Tasas Empleador (Costo Empresa)
const TASA_SIS = 0.0149; // 1.49%
const TASA_MUTUAL_BASE = 0.0093; // 0.93%
const TASA_MUTUAL_RIESGO = 0.00; // Se puede configurar extra por riesgo cocina (ej: 1.7% DS 67)
const TASA_SEGURO_SOCIAL_NUEVO = 0.01; // 1% Ley Reforma 2025

// Seguro Cesantía Rates
// Indefinido: 0.6% Trab, 2.4% Empl
// Plazo Fijo: 0% Trab, 3.0% Empl
const CESANTIA_INDEFINIDO_TRAB = 0.006;
const CESANTIA_INDEFINIDO_EMPL = 0.024;
const CESANTIA_FIJO_TRAB = 0;
const CESANTIA_FIJO_EMPL = 0.030;

// AFP Rates (approx)
const RATES_AFP: Record<string, number> = {
    'Capital': 0.1144,
    'Cuprum': 0.1144,
    'Habitat': 0.1127,
    'Modelo': 0.1058,
    'PlanVital': 0.1116,
    'Provida': 0.1145,
    'Uno': 0.1069,
    'SystemDefault': 0.11
};

export interface SalaryResult {
    sueldoBase: number;
    gratificacion: number;
    horasExtras: number;
    totalImponible: number;

    descuentosTrabajador: {
        afpMonto: number;
        afpNombre: string;
        saludMonto: number;
        cesantiaMonto: number;
        impuestoUnico: number;
        total: number;
    };

    haberesNoImponibles: {
        colacion: number;
        movilizacion: number;
        propinas: number; // Informativo
        total: number;
    };

    sueldoLiquidoEstimado: number;

    costoEmpresaTotal: {
        aporteCesantia: number;
        aporteSis: number;
        aporteMutual: number;
        aporteSeguroSocialNuevo: number;
        costoFinalMensual: number;
    };

    alertas: string[];
}

export function calculateSalary(staff: Staff, shifts: Shift[] = [], month: Date = new Date()): SalaryResult {
    const alertas: string[] = [];

    // A. VALIDACION SUELDO MINIMO
    let sueldoBase = staff.baseSalary || 0;
    if (staff.contractType !== 'part-time' && staff.contractType !== 'art-22' && staff.salaryType === 'monthly') {
        if (sueldoBase < IMM_2025) {
            alertas.push(`¡ALERTA LEGAL! El sueldo base ($${sueldoBase}) es menor al mínimo ($${IMM_2025}). Ajustado a mínimo.`);
            sueldoBase = IMM_2025;
        }
    }

    // B. GRATIFICACION (Legal HORECA)
    // Formula: MIN(SueldoBase * 0.25, Tope).
    // Prorrateo Part-Time: Si horas < 30, el tope baja proporcionalmente.
    // Referencia: 44 horas jornada ordinaria actual/transitoria.
    let gratificacion = 0;
    if (staff.gratification !== false && staff.salaryType !== 'monthly' && staff.salaryType !== 'hourly') {
        // Logic for Hourly usually includes gratification in hourly rate or not? 
        // HORECA standard is monthly base. Assuming monthly.
    }

    // Defaulting to calculating gratification for all unless explicitly disabled
    if (staff.gratification !== false) {
        const raw25 = sueldoBase * 0.25;
        let tope = TOPE_GRATIFICACION_MENSUAL;

        // Prorrateo Part-Time
        if (staff.contractType === 'part-time' && staff.weeklyHoursLimit && staff.weeklyHoursLimit < 44) {
            // Factor: HorasContrato / 44
            const factor = staff.weeklyHoursLimit / 44;
            tope = Math.round(TOPE_GRATIFICACION_MENSUAL * factor);
            if (staff.weeklyHoursLimit < 44) {
                // Not pushing alert usually, just doing logic. But verifying user request.
            }
        }
        gratificacion = Math.min(raw25, tope);
    }

    // C. IMPONIBLE
    const totalImponible = sueldoBase + gratificacion; // + Horas Extras (skipped for simulation base)

    // D. DESCUENTOS TRABAJADOR
    // 1. AFP
    const rateAFP = RATES_AFP[staff.afp || 'Modelo'] || 0.1058;
    const afpMonto = Math.round(totalImponible * rateAFP);

    // 2. Salud
    let saludMonto = Math.round(totalImponible * 0.07);
    if (staff.healthSystem === 'Isapre' && staff.healthFee) {
        // Simple conversion heuristic
        const planPesos = staff.healthFee < 100 ? staff.healthFee * VALOR_UF_REF : staff.healthFee;
        saludMonto = Math.round(Math.max(saludMonto, planPesos));
    }

    // 3. Cesantía (Trabajador)
    // Indefinido: 0.6%. Plazo Fijo: 0%.
    let cesantiaMonto = 0;
    let tasaCesantiaEmpl = CESANTIA_INDEFINIDO_EMPL; // 2.4% Default

    if (staff.contractDuration === 'fixed') {
        cesantiaMonto = 0; // Trabajador paga 0
        tasaCesantiaEmpl = CESANTIA_FIJO_EMPL; // Empleador paga 3.0%
        alertas.push("Contrato Plazo Fijo: Trabajador no paga cesantía (Costo Empleador sube a 3.0%)");
    } else {
        // Indefinido
        cesantiaMonto = Math.round(totalImponible * CESANTIA_INDEFINIDO_TRAB); // 0.6%
    }

    // 4. Impuesto Único de Segunda Categoría (2025 Ref)
    // Base Tributable = Imponible - (AFP + Salud + Cesantía)
    const baseTributable = totalImponible - (afpMonto + saludMonto + cesantiaMonto);
    let impuestoUnico = 0;

    // Monthly Tax Table (UTA/UTM Ref Feb 2025 approx)
    // Factor is marginal rate, Rebaja is generic deduction
    const UTA_FACTOR = 1; // Simplified for CLP ranges directly (Source: SII 2024/2025 Estimations)
    // Ranges based on generic UTM ~64.000
    if (baseTributable <= 870000) {
        impuestoUnico = 0;
    } else if (baseTributable <= 1930000) {
        impuestoUnico = (baseTributable * 0.04) - 34800;
    } else if (baseTributable <= 3220000) {
        impuestoUnico = (baseTributable * 0.08) - 112000;
    } else if (baseTributable <= 4500000) {
        impuestoUnico = (baseTributable * 0.135) - 289100;
    } else if (baseTributable <= 5800000) {
        impuestoUnico = (baseTributable * 0.23) - 716600;
    } else {
        impuestoUnico = (baseTributable * 0.304) - 1145800; // Cap for now
    }

    // Ensure non-negative
    impuestoUnico = Math.round(Math.max(0, impuestoUnico));

    const totalDescuentos = afpMonto + saludMonto + cesantiaMonto + impuestoUnico;

    // E. NO IMPONIBLES
    const colacion = staff.colacion || 0;
    const movilizacion = staff.movilizacion || 0;
    const propinas = staff.estimatedTips || 0;

    const totalNoImponible = colacion + movilizacion + propinas;

    // F. LIQUIDO
    const sueldoLiquidoEstimado = (totalImponible - totalDescuentos) + totalNoImponible;

    // G. COSTO EMPRESA
    const aporteSis = Math.round(totalImponible * TASA_SIS);
    const aporteMutual = Math.round(totalImponible * (TASA_MUTUAL_BASE + TASA_MUTUAL_RIESGO));
    const aporteCesantia = Math.round(totalImponible * tasaCesantiaEmpl);
    const aporteSeguroSocialNuevo = Math.round(totalImponible * TASA_SEGURO_SOCIAL_NUEVO); // 1% Ley 2025

    const totalAportes = aporteSis + aporteMutual + aporteCesantia + aporteSeguroSocialNuevo;
    // El costo empresa NO incluye las propinas, pues las paga el cliente.
    // Costo = Imponible + Aportes + Colacion + Movilizacion (Estas 2 si las paga empresa)
    // Propinas son passthrough o directas.
    const costoFinalMensual = totalImponible + totalAportes + colacion + movilizacion;

    return {
        sueldoBase,
        gratificacion: Math.round(gratificacion),
        horasExtras: 0,
        totalImponible: Math.round(totalImponible),

        descuentosTrabajador: {
            afpMonto,
            afpNombre: staff.afp || 'Modelo',
            saludMonto,
            cesantiaMonto,
            impuestoUnico,
            total: totalDescuentos
        },

        haberesNoImponibles: {
            colacion,
            movilizacion,
            propinas,
            total: totalNoImponible
        },

        sueldoLiquidoEstimado: Math.round(sueldoLiquidoEstimado),

        costoEmpresaTotal: {
            aporteCesantia,
            aporteSis,
            aporteMutual,
            aporteSeguroSocialNuevo,
            costoFinalMensual: Math.round(costoFinalMensual)
        },

        alertas
    };
}
