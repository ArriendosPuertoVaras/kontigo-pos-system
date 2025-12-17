
// This file defines the "Virtual Head Chef" agent configuration and types.
// It is designed to be used with an LLM to generate operational kitchen data.

/**
 * The System Prompt for the Virtual Head Chef.
 * This defines the persona, rules, and output format for the LLM.
 */
export const KITCHEN_AGENT_SYSTEM_PROMPT = `
# ROL
Eres el "Jefe de Cocina Virtual" de Kontigo. Tu tarea es estructurar las Fichas Técnicas Operativas para las pantallas de cocina (KDS).

# REGLA DE ORO: GESTIÓN DE IMÁGENES
NUNCA pidas al usuario que escriba o pegue una URL para la foto del plato.
- Tu sistema funciona con cargas nativas.
- Si el usuario quiere agregar una foto, debes generar el comando JSON \`ui_trigger: open_media_uploader\`.

# INSTRUCCIONES DE GENERACIÓN DE FICHA
Cuando el usuario (Dueño) esté creando o editando un plato, genera un JSON con la siguiente lógica:

1. **Header:** Nombre y Estación de trabajo (Fritura, Cuarto Frío, etc.).
2. **Timing:** Tiempos de servicio.
3. **Plating (FOTO):**
   - Si ya existe foto: Incluye la URL en el campo \`image_src\`.
   - Si NO existe o el usuario dice "quiero subir foto": Deja el campo \`image_src\` como null y activa el \`ui_trigger\`.
4. **Operación:** Pasos, herramientas y vajilla.
5. **Seguridad:** Alérgenos (Detecta ingredientes peligrosos automáticamente).
6. **Privacidad:** Oculta absolutamente todos los costos y precios.

# FORMATO DE SALIDA (JSON UI)
Tu respuesta debe ser siempre este objeto JSON. Si se requiere subir foto, el bloque "ui_trigger" debe estar presente.

{
  "view_mode": "kitchen_recipe_card",
  // SOLO INCLUIR ESTE BLOQUE SI EL USUARIO PIDE SUBIR/CAMBIAR FOTO
  "ui_trigger": {
      "action": "open_media_uploader",
      "target_field": "plating_image",
      "compression": "webp_optim"
  },
  "recipe_data": {
    "header": {
      "title": "String",
      "station": "String",
      "service_time_min": Number,
      // Este campo se llena solo cuando Supabase confirma la carga, si no, va null
      "image_src": "String (URL) | null"
    },
    "ingredients_operational": [
      // Solo cantidad neta y unidad visual (ej: 1 puñado, 2 láminas)
      {"item": "String", "qty": "String", "notes": "String"}
    ],
    "steps": [
      {"step_num": 1, "instruction": "String"}
    ],
    "safety_alerts": {
      "allergens": ["Gluten", "Lactosa", "Nueces"], // Detectar según ingredientes
      "plating_dish": "String (ej: Plato Hondo Negro)"
    }
  }
}
`;

// --- TYPES ---

export interface KitchenRecipeHeader {
    title: string;
    station: string; // e.g. "Fritura", "Cuarto Frío"
    service_time_min: number;
    image_src: string | null;
}

export interface KitchenIngredientOp {
    item: string;
    qty: string;
    notes?: string;
}

export interface KitchenStep {
    step_num: number;
    instruction: string;
}

export interface KitchenSafetyAlerts {
    allergens: string[];
    plating_dish: string;
}

export interface ExampleUiTrigger {
    action: "open_media_uploader";
    target_field: "plating_image";
    compression: "webp_optim";
}

export interface KitchenRecipeData {
    header: KitchenRecipeHeader;
    ingredients_operational: KitchenIngredientOp[];
    steps: KitchenStep[];
    safety_alerts: KitchenSafetyAlerts;
}

/**
 * The main JSON response structure expected from the Agent.
 */
export interface KitchenAgentResponse {
    view_mode: "kitchen_recipe_card";
    ui_trigger?: ExampleUiTrigger;
    recipe_data: KitchenRecipeData;
}

/**
 * Placeholder function for generating the recipe card.
 * In a real implementation, this would call an LLM (OpenAI, Anthropic, etc.)
 * with the SYSTEM_PROMPT and the user's input/product details.
 */
export async function generateKitchenCard(
    dishName: string,
    ingredientsList: string[],
    userRequest?: string
): Promise<KitchenAgentResponse> {

    // TODO: Connect to an LLM here.
    // For now, we return a mock response to demonstrate the structure.

    console.warn("generateKitchenCard is running in MOCK mode. Connect an LLM to generate real data.");

    return {
        view_mode: "kitchen_recipe_card",
        recipe_data: {
            header: {
                title: dishName,
                station: "Cocina Caliente",
                service_time_min: 15,
                image_src: null
            },
            ingredients_operational: ingredientsList.map(ing => ({
                item: ing,
                qty: "1 porción",
                notes: "Verificar frescura"
            })),
            steps: [
                { step_num: 1, instruction: `Preparar ${dishName} siguiendo el estándar.` },
                { step_num: 2, instruction: "Emplatar cuidadosamente." }
            ],
            safety_alerts: {
                allergens: [], // TODO: Detect allergens
                plating_dish: "Plato Estándar"
            }
        }
    };
}
