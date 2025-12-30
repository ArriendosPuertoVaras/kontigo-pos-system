'use client';
// --- COMPONENTS ---
import { useEffect, useState, useRef, Suspense } from 'react';
import { LayoutGrid, UtensilsCrossed, ClipboardList, Settings, LogOut, Bell, Wifi, X, Check, Package, Truck, ShoppingCart, Trash2, Users, Plus, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabase, Product, ModifierGroup, ModifierOption, RestaurantTable, TicketItem, Order } from '@/lib/db';
import { KontigoFinance } from '@/lib/accounting';
import { printOrderToKitchen } from '@/lib/printing';
import { getRecipeItemConversion } from '@/lib/recipes';
import PaymentModal from '@/components/PaymentModal';
import ClockOutModal from '@/components/ClockOutModal';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

import { usePermission } from '@/hooks/usePermission';
import { Lock } from 'lucide-react';

function POSContent() {
  const hasPOSAccess = usePermission('pos:view');

  const searchParams = useSearchParams();
  const router = useRouter();
  const tableIdParam = searchParams.get('tableId');
  const tableId = tableIdParam ? parseInt(tableIdParam) : null;

  // --- AUTH & ROUTING CHECK ---
  useEffect(() => {
    if (!sessionStorage.getItem('kontigo_staff_id')) {
      router.push('/login');
    } else if (!tableIdParam && searchParams.get('mode') !== 'pos') {
      // FORCE REDIRECT TO TABLES IF NO SPECIFIC TABLE IS SELECTED AND NOT IN POS MODE
      router.push('/tables');
    }
  }, [router, tableIdParam, searchParams]);

  const [activeCategoryId, setActiveCategoryId] = useState(1);
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [showMobileTicket, setShowMobileTicket] = useState(false);

  // Table State
  const activeTable = useLiveQuery<RestaurantTable | undefined>(
    () => tableId ? db.restaurantTables.get(tableId) : Promise.resolve(undefined),
    [tableId]
  );

  const activeOrder = useLiveQuery(
    async () => {
      if (!activeTable || !activeTable.currentOrderId) return null;
      return db.orders.get(activeTable.currentOrderId);
    },
    [activeTable]
  );

  // Load Ticket from Order if exists
  useEffect(() => {
    if (activeOrder && (activeOrder.status === 'open' || activeOrder.status === 'ready')) {
      setTicket(activeOrder.items);
    } else if (tableId && !activeOrder) {
      setTicket([]); // Reset if new table
    }
  }, [activeOrder, tableId]);

  // Modifiers State
  const [productForModifiers, setProductForModifiers] = useState<Product | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<ModifierOption[]>([]);

  // Inventory State (Debug/Verification)
  const [showStock, setShowStock] = useState(false);
  const ingredients = useLiveQuery(() => db.ingredients.toArray());

  // Quick Edit State (Manager Mode)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, product: Product } | null>(null);

  // Shift Management
  // Shift Management
  const [showClockOut, setShowClockOut] = useState(false);

  // LISTEN FOR SIDEBAR CLOCK-OUT EVENT
  useEffect(() => {
    const handleClockOut = () => setShowClockOut(true);
    window.addEventListener('open-clock-out', handleClockOut);
    return () => window.removeEventListener('open-clock-out', handleClockOut);
  }, []);

  // --- CLOCK TICKER ---
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTicker(t => t + 1), 1000); // Update every second
    return () => clearInterval(timer);
  }, []);

  // --- DATA HEALING REMOVED VIA USER REQUEST (CLEAN SLATE) ---
  // (Logic Deleted)

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Note Modal State
  const [noteModal, setNoteModal] = useState<{ index: number, text: string } | null>(null);

  const handleSaveNote = () => {
    if (!noteModal) return;
    setTicket(prev => prev.map((item, i) =>
      i === noteModal.index ? { ...item, notes: noteModal.text } : item
    ));
    setNoteModal(null);
  };

  // Initialize DB
  useEffect(() => {
    // seedDatabase(); // DISABLED FOR CLEAN WIPE
    KontigoFinance.initialize();
  }, []);

  // Hydration-safe User State
  const [staffName, setStaffName] = useState('Staff');
  const [staffRole, setStaffRole] = useState('Personal');

  // Local Notification State (Restored for Save/Error feedback)
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    setStaffName(sessionStorage.getItem('kontigo_staff_name') || 'Staff');
    setStaffRole(sessionStorage.getItem('kontigo_staff_role') || 'Personal');
  }, []);



  // --- SELF-HEALING: FIX CORRUPTED CATEGORY IDS ---
  // Some products have categoryId as "String Name" instead of "Number ID". We fix this on boot.
  useEffect(() => {
    const healData = async () => {
      try {
        const productsWithIssues = await db.products.filter(p => typeof (p.categoryId as any) === 'string').toArray();
        if (productsWithIssues.length === 0) return;

        console.log(`🏥 Healing ${productsWithIssues.length} products with corrupted IDs...`);
        const categories = await db.categories.toArray();
        let fixed = 0;

        for (const p of productsWithIssues) {
          const badId = (p.categoryId as any) as string;
          // 1. Try Name Match
          const match = categories.find(c => c.name.trim().toLowerCase() === badId.trim().toLowerCase());
          if (match && match.id) {
            await db.products.update(p.id!, { categoryId: match.id });
            fixed++;
          }
          // 2. Try identifying "Number as String" (e.g. "5")
          else if (!isNaN(parseInt(badId))) {
            await db.products.update(p.id!, { categoryId: parseInt(badId) });
            fixed++;
          }
        }

        if (fixed > 0) {
          // setNotification(`✅ Se repararon ${fixed} productos. Recargando...`);
          // setTimeout(() => window.location.reload(), 1500);
        }
      } catch (e) {
        console.error("Healer error:", e);
      }
    };
    healData();
  }, []);

  // Fetch Data Live from IndexedDB
  const categories = useLiveQuery(() => db.categories.toArray());
  // Robust Product Fetching: Handles Type Mismatches AND Duplicate Categories
  // NUCLEAR FIX ☢️: Handle ID (number), ID (string), and NAME (string)
  const products = useLiveQuery(
    async () => {
      // 1. Get the current active category
      const activeCat = await db.categories.get(activeCategoryId);
      if (!activeCat) return [];

      // 2. Prepare Match Targets
      // Target A: The exact Numeric ID (Standard)
      // Target B: The String ID (Legacy sync)
      // Target C: The Name itself (User reported screenshot showing Name in field)
      const activeNameLower = activeCat.name.trim().toLowerCase();

      // Also catch duplicates/ghosts by name to add their IDs
      const sameNameCategories = await db.categories
        .filter(c => c.name.trim().toLowerCase() === activeNameLower)
        .toArray();
      const duplicateIds = sameNameCategories.map(c => c.id).filter(id => id !== undefined);

      // 3. NUCLEAR FILTER: Match ANYTHING that resembles this category
      return await db.products.filter(p => {
        // A. Match by Numeric IDs (Current + Duplicates)
        if (duplicateIds.some(id => id == p.categoryId)) return true;

        // B. Match by NAME (If legacy data stored "Entradas" instead of ID 1)
        const catId = p.categoryId as any;
        if (typeof catId === 'string') {
          return catId.trim().toLowerCase() === activeNameLower;
        }

        return false;
      }).toArray();
    },
    [activeCategoryId]
  );


  // --- TICKET LOGIC ---
  const handleProductClick = (product: Product) => {
    // Prevent adding out-of-stock items
    if (product.isAvailable === false) return;

    if (product.modifiers && product.modifiers.length > 0) {
      // Open Modifiers Modal
      setProductForModifiers(product);
      setPendingModifiers([]);
    } else {
      // Add directly
      addToTicket(product);
    }
  };

  const addToTicket = (product: Product, modifiers: ModifierOption[] = []) => {
    setTicket(prev => {
      // Only group exactly same items (same ID AND same modifiers)
      if (modifiers.length > 0) {
        return [...prev, { product, quantity: 1, selectedModifiers: modifiers }];
      }

      // Group standard items
      const existing = prev.find(item => item.product.id === product.id && (!item.selectedModifiers || item.selectedModifiers.length === 0));
      if (existing) {
        return prev.map(item =>
          (item.product.id === product.id && (!item.selectedModifiers || item.selectedModifiers.length === 0))
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, selectedModifiers: [] }];
    });
  };

  const removeFromTicket = (index: number) => {
    setTicket(prev => prev.filter((_, i) => i !== index));
  };

  const confirmModifiers = () => {
    if (productForModifiers) {
      addToTicket(productForModifiers, pendingModifiers);
      setProductForModifiers(null);
      setPendingModifiers([]);
    }
  };

  const toggleModifier = (group: ModifierGroup, option: ModifierOption) => {
    setPendingModifiers(prev => {
      const isSelected = prev.some(m => m.id === option.id);

      // Radio logic (maxSelect = 1)
      if (group.maxSelect === 1) {
        if (isSelected && group.minSelect === 0) {
          // Toggle off if optional
          return prev.filter(m => m.id !== option.id);
        }
        // Replace existing selection from this group
        return [...prev.filter(m => !group.options.some(opt => opt.id === m.id)), option];
      }

      // Checkbox logic
      if (isSelected) {
        return prev.filter(m => m.id !== option.id);
      } else {
        return [...prev, option];
      }
    });
  };

  // Calculations
  const subtotal = ticket.reduce((sum, item) => {
    const itemPrice = item.product.price;
    const modifiersPrice = item.selectedModifiers?.reduce((acc, mod) => acc + mod.price, 0) || 0;
    return sum + ((itemPrice + modifiersPrice) * item.quantity);
  }, 0);

  const net = Math.round(subtotal / 1.19);
  const iva = subtotal - net;
  const tip = Math.round(subtotal * 0.10); // 10% Propina sugerida (Visual only)
  const total = subtotal; // Total debt = Consumption only. Tip is optional/extra.

  // Quick Edit Logic
  const handleContextMenu = (e: React.MouseEvent, product: Product) => {
    e.preventDefault(); // Prevent browser menu
    setContextMenu({ x: e.clientX, y: e.clientY, product });
  };

  const toggleAvailability = async () => {
    if (!contextMenu) return;
    const prod = contextMenu.product;
    // Toggle DB
    await db.products.update(prod.id!, { isAvailable: !prod.isAvailable });
    // Close menu
    setContextMenu(null);
  };

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // --- AVAILABILITY CHECK HELPER ---
  const isProductOutOfStock = (product: Product) => {
    // 1. If explicitly unavailable manually
    if (product.isAvailable === false) return true;

    // 2. If it has Batch Stock (Created via Production), use it!
    if ((product.stock || 0) > 0) return false;

    // 3. If no recipe, assume available (unless stock was specifically 0 and it's a tracked item? 
    // For now, if no recipe and stock is 0/undefined, we assume it's untracked/infinite like "Water").
    if (!product.recipe || product.recipe.length === 0) return false;

    // 4. Check Ingredients (Made to Order OR Empty Batch backup)
    // We only block if ingredients are STRICTLY insufficient using correct units.
    if (!ingredients) return false; // Loading... assume available

    return product.recipe.some(recipeItem => {
      const ingredient = ingredients.find(i => i.id === recipeItem.ingredientId);
      if (!ingredient) return false; // Missing data shouldn't block sales in POS? Or should? Safety: Don't block.

      const { convertedQuantity } = getRecipeItemConversion(ingredient, recipeItem);
      return ingredient.stock < convertedQuantity;
    });
  };

  const formatPrice = (amount: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);

  // --- PAYMENT LOGIC ---
  // --- SAVE ORDER LOGIC ---
  // --- SAVE ORDER LOGIC ---
  // --- SAVE ORDER LOGIC ---
  const handleSaveOrder = async (redirect = true): Promise<boolean> => {
    if (ticket.length === 0) {
      setNotification("⚠️ La orden está vacía. Agrega productos.");
      setTimeout(() => setNotification(null), 3000);
      return false;
    }

    if (!tableId) {
      setNotification("⚠️ Solo se pueden guardar órdenes asignadas a una mesa.");
      setTimeout(() => setNotification(null), 3000);
      return false;
    }

    try {
      if (activeTable?.currentOrderId) {
        // Update existing order
        await db.orders.update(activeTable.currentOrderId, {
          items: ticket,
          subtotal,
          tip,
          total
        });
      } else {
        // Create new order
        const newOrderId = await db.orders.add({
          tableId,
          items: ticket,
          status: 'open',
          subtotal,
          tip,
          total,
          createdAt: new Date()
        });
        // Link to table
        await db.restaurantTables.update(tableId, { status: 'occupied', currentOrderId: newOrderId as number });
      }

      if (redirect) {
        router.push('/tables');
      }
      return true;

    } catch (error) {
      console.error("Error saving order:", error);
      setNotification("❌ Error al guardar la orden");
      setTimeout(() => setNotification(null), 3000);
      return false;
    }
  };

  const handleMarchar = async () => {
    const saved = await handleSaveOrder(false); // Save to DB first
    if (!saved) return; // Stop if save failed

    // Print to configured printers
    const result = await printOrderToKitchen(ticket, activeTable?.name || 'Venta Rápida');

    if (result.success) {
      setNotification(`👨‍🍳 ¡Orden enviada a cocina!`);
      setTimeout(() => setNotification(null), 3000);
      router.push('/tables');
    } else {
      setNotification(`⚠️ Error de impresión: ${result.message}`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const finalizeOrder = async (order: Order) => {
    try {
      // 1. Deduct Stock (Iterate final items)
      console.log("Finalizing order, deducting stock...");
      for (const item of order.items) {
        // A. If Product has Batch Stock (Kitchen Production Item), deduct from Product Stock
        // We assume that if stock is being tracked (even if currently 0), we should deduct from it (going negative is better than double-deducting ingredients)
        // How to know if it is a batch item? 
        // Heuristic: If it has a recipe AND is a "Kitchen" item? 
        // Simplest: If `stock` property is defined on the product object in DB. 
        // But `stock` might be 0. 

        // Let's use the same logic: If we have positive stock, we definitely deduct from it.
        // If we have 0 stock, but it IS a batch item, we should still deduct from it (negative stock) rather than ingredients.
        // BUT, currently we don't have a strict flag for "Batch Tracked". 
        // Changing strategy: If stock > 0, deduct stock. If stock <= 0, deduct ingredients?
        // No, that mixes models. 

        // BETTER: Check if the product category destination is 'kitchen'. 
        // If 'kitchen', it's likely a batch item? Not necessarily (Steak).

        // FOR THIS USER: "Entradas con Perso" (Empanadas) are clearly Batch.
        // Let's rely on: If `img` (image) or logic implies batch? No.

        // SAFE HYBRID FOR NOW:
        // If `product.stock` is greater than 0, we DEDUCT STOCK.
        // If `product.stock` is <= 0... 
        //   If we allowed headers to produce it, we should deduct stock. 

        // Let's use: If stock > -100 (basically if the field exists and is numeric), deduct stock?
        // No, `product.stock` is on the object.

        // Current implementation of `produce`: Updates `stock`.
        // So `stock` will be > 0.

        if ((item.product.stock || 0) > 0) {
          const currentStock = item.product.stock || 0;
          await db.products.update(item.product.id!, { stock: currentStock - item.quantity });
        } else {
          // Fallback: Deduct Ingredients (Made to Order)
          if (item.product.recipe) {
            for (const recipeItem of item.product.recipe) {
              // Use raw quantity from recipe (no conversion needed for simple deduction if units align, but safer to use simple math here as recipe is source of truth for 'un'/'gr')
              // Wait, ingredient.stock is in DB unit. Recipe is in Recipe Unit.
              // We MUST use conversion here too!
              const ingredient = await db.ingredients.get(recipeItem.ingredientId);
              if (ingredient) {
                const { convertedQuantity } = getRecipeItemConversion(ingredient, recipeItem);
                await db.ingredients.update(ingredient.id!, { stock: ingredient.stock - (convertedQuantity * item.quantity) });
              }
            }
          }
        }
      }

      // 2. Release Table (Logic moved here from legacy handlePay)
      if (order.tableId) {
        await db.restaurantTables.update(order.tableId, { status: 'available', currentOrderId: undefined });
      }

      // 3. Clear Local State & Redirect
      setTicket([]);
      setIsPaymentModalOpen(false);

      setNotification("✅ ¡Venta completada con éxito!");
      setTimeout(() => setNotification(null), 3000);

      if (order.tableId) router.push('/tables');

    } catch (error) {
      console.error("Finalization error:", error);
      setNotification("❌ Error al finalizar la orden (Stock/Mesa)");
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handlePay = async () => {
    if (ticket.length === 0) return;

    // SECURITY CHECK: ACTIVE CASH SESSION
    const activeSession = await db.dailyCloses.where('status').equals('open').first();
    if (!activeSession) {
      setNotification("⛔ Caja Cerrada: Debes realizar la Apertura de Caja");
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Ensure order is saved before paying
    const saved = await handleSaveOrder(false);
    if (!saved) return;

    // Open Modal
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async () => {
    // Check if fully paid
    if (!activeOrder?.id) return;

    const refreshedOrder = await db.orders.get(activeOrder.id);
    if (refreshedOrder && refreshedOrder.status === 'paid') {
      await finalizeOrder(refreshedOrder);
    }
  };

  const deductStock = async (ingredientId: number, amount: number) => {
    const ingredient = await db.ingredients.get(ingredientId);
    if (ingredient) {
      const newStock = ingredient.stock - amount;
      await db.ingredients.update(ingredientId, { stock: newStock });
    }
  };

  const handleCloseTable = async () => {
    if (!activeTable) return;

    // Removed confirmation check as requested to streamline flow
    // if (ticket.length > 0 && !confirm("⚠️ ¿Cerrar mesa y perder cambios?")) return;

    try {
      if (activeTable.currentOrderId) {
        await db.orders.delete(activeTable.currentOrderId);
      }
      await db.restaurantTables.update(activeTable.id!, { status: 'available', currentOrderId: undefined });
      router.push('/tables');
    } catch (e) {
      console.error(e);
      alert("Error al cerrar mesa");
    }
  };

  return (
    <div className="flex h-screen w-full bg-toast-charcoal text-white font-sans selection:bg-toast-orange selection:text-white relative">

      {/* MODIFIERS MODAL OVERLAY */}
      {productForModifiers && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-toast-charcoal-dark w-full max-w-3xl h-full max-h-[70vh] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 scale-[0.85] origin-center">
            {/* Header */}
            <div className="h-20 border-b border-white/10 flex items-center justify-between px-8 bg-toast-charcoal">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{productForModifiers.name}</h2>
                <p className="text-toast-text-gray text-sm">Personaliza tu pedido</p>
              </div>
              <button onClick={() => setProductForModifiers(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {productForModifiers.modifiers?.map(group => (
                <div key={group.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white">{group.name}</h3>
                    {group.minSelect > 0 && <span className="text-[10px] font-bold text-toast-orange bg-toast-orange/10 px-2 py-0.5 rounded">REQUERIDO</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {group.options.map(option => {
                      const isSelected = pendingModifiers.some(m => m.id === option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => toggleModifier(group, option)}
                          className={`h-14 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 transition-all
                                                ${isSelected
                              ? 'border-toast-blue bg-toast-blue/10 text-white shadow-lg shadow-blue-900/20'
                              : 'border-white/5 bg-toast-charcoal-light text-gray-400 hover:bg-white/5'}`}
                        >
                          {isSelected && <Check className="w-4 h-4 text-toast-blue absolute top-1 right-1" />}
                          <span className="font-bold text-xs text-center leading-tight px-1">{option.name}</span>
                          {option.price > 0 && <span className="text-[10px] font-mono text-gray-500">+${option.price}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="h-24 border-t border-white/10 bg-toast-charcoal p-4 flex gap-4">
              <button onClick={() => setProductForModifiers(null)} className="flex-1 rounded-xl font-bold text-lg text-white hover:bg-white/5 border border-white/10 transition-colors uppercase">
                Cancelar
              </button>
              <button
                onClick={confirmModifiers}
                disabled={productForModifiers.modifiers?.some(g => g.minSelect > 0 && !pendingModifiers.some(m => g.options.some(o => o.id === m.id)))}
                className="flex-[2] bg-toast-green hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-2xl text-white shadow-lg shadow-green-900/20 transition-all uppercase"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}



      {/* INVENTORY MODAL (Simple List) */}
      {showStock && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-toast-charcoal-dark w-full max-w-xl max-h-[70vh] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 scale-[0.85] origin-center">
            <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-toast-charcoal">
              <h2 className="text-xl font-bold text-white">Inventario en Tiempo Real</h2>
              <button onClick={() => setShowStock(false)}><X className="text-white" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="text-xs uppercase bg-white/5 text-gray-200">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Ingrediente</th>
                    <th className="px-4 py-3">Stock Actual</th>
                    <th className="px-4 py-3 rounded-r-lg">Unidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ingredients?.map(ing => (
                    <tr key={ing.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{ing.name}</td>
                      <td className={`px-4 py-3 font-bold ${ing.stock < 10 ? 'text-red-500' : 'text-green-400'}`}>
                        {ing.stock}
                      </td>
                      <td className="px-4 py-3">{ing.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* QUICK EDIT CONTEXT MENU */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-[100] bg-toast-charcoal-dark border border-white/10 shadow-2xl rounded-lg p-2 w-48 animate-in fade-in zoom-in-95 duration-100 origin-top-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-gray-500 font-bold px-2 py-1 mb-1 uppercase tracking-wider">Acciones Rápidas</p>
          <button
            onClick={toggleAvailability}
            className={`w-full text-left px-3 py-2 rounded-md font-bold text-sm flex items-center justify-between
                ${contextMenu.product.isAvailable !== false ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}
          >
            {contextMenu.product.isAvailable !== false ? 'Marcar Agotado' : 'Marcar Disponible'}
            <div className={`w-3 h-3 rounded-full ${contextMenu.product.isAvailable !== false ? 'bg-red-500' : 'bg-green-500'}`}></div>
          </button>
        </div>
      )}


      {/* SIDEBAR NAVIGATION */}
      {/* UNIFIED SIDEBAR */}
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/*
        {hasPOSAccess === false ? (
          <div className="w-full h-full flex items-center justify-center bg-[#2a2a2a] text-white">
            <div className="flex flex-col items-center gap-4 p-8 bg-white/5 rounded-2xl border border-white/10 max-w-sm text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <Lock className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-1">POS Restringido</h2>
                <p className="text-sm text-gray-400">No tienes permisos para operar el Punto de Venta.</p>
              </div>
            </div>
          </div>
        ) : (
          */}
        <>
          {/* TOP HEADER */}
          <Header title="Salón Principal" />

          {/* POS GRID LAYOUT */}
          <div className="flex-1 p-3 flex flex-col md:grid md:grid-cols-12 gap-3 h-full overflow-hidden bg-[#2a2a2a] relative">

            {/* LEFT: TICKET VIEW (Order Summary) */}
            {/* Mobile: Hidden by default, shown via state/overlay. Desktop: Always visible col-span-4 */}
            <div className={`
              bg-toast-charcoal flex flex-col h-full rounded-lg shadow-2xl border border-white/5 overflow-hidden
              absolute md:static inset-0 z-40 md:z-auto transition-transform duration-300
              ${showMobileTicket ? 'translate-y-0' : 'translate-y-[110%] md:translate-y-0'}
              md:col-span-4
          `}>
              {/* Ticket Header */}

              <div className="p-4 bg-toast-charcoal-dark border-b border-white/5 flex justify-between items-center shrink-0">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-bold text-lg text-white">
                      {activeTable ? activeTable.name : 'Venta Rápida'}
                    </h2>
                    {/* READY STATUS INDICATOR */}
                    {activeOrder?.status === 'ready' && !(activeOrder as any).isDelivered && (
                      <button
                        onClick={async () => {
                          if (activeOrder?.id) {
                            await db.orders.update(activeOrder.id, { isDelivered: true } as any);
                          }
                        }}
                        className={`w-6 h-6 rounded-full animate-pulse shadow-lg border-2 border-white/20 
                          ${activeOrder.items.some(i => {
                          const cat = categories?.find(c => c.id === i.product.categoryId);
                          return cat?.destination === 'bar';
                        }) && !activeOrder.items.some(i => {
                          const cat = categories?.find(c => c.id === i.product.categoryId);
                          return cat?.destination !== 'bar';
                        })
                            ? 'bg-blue-500 shadow-blue-500/50' // Only Bar items -> Blue
                            : 'bg-yellow-500 shadow-yellow-500/50' // Kitchen or Mixed -> Yellow
                          }`}
                        title="Pedido Listo! Clic para confirmar entrega"
                      />
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {activeOrder ? `Orden #${activeOrder.id}` : 'Nueva Venta'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {/* Mobile Close Button */}
                  <button onClick={() => setShowMobileTicket(false)} className="md:hidden p-2 text-white/50 hover:text-white bg-white/10 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>

                  <button onClick={handleCloseTable} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded transition-colors" title="Cerrar Mesa / Cancelar">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => router.push('/tables')} className="text-toast-blue text-sm font-bold uppercase tracking-wide px-3 py-1 hover:bg-white/5 rounded hidden md:block">
                    Ver Mesas
                  </button>
                </div>
              </div>

              {/* Ticket Body */}
              <div className="flex-1 p-0 overflow-y-auto flex flex-col">
                {ticket.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2 opacity-50">
                    <ClipboardList className="w-12 h-12" />
                    <p className="text-sm">Sin productos</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {ticket.map((item, index) => (
                      <div key={index} className="flex justify-between items-start p-3 border-b border-white/5 bg-toast-charcoal hover:bg-white/5 transition-colors group">
                        <div className="flex gap-3 relative group/item">
                          <div className="w-6 h-6 bg-toast-charcoal-light rounded flex items-center justify-center text-xs font-bold text-white border border-white/10 shrink-0">
                            {item.quantity}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-white text-sm leading-tight truncate">{item.product.name}</p>

                              {/* Add Note Button (Compact) */}
                              <button
                                onClick={() => setNoteModal({ index, text: item.notes || '' })}
                                className="bg-white/5 hover:bg-white/20 rounded-full p-0.5 w-4 h-4 text-yellow-500 hover:text-yellow-400 flex items-center justify-center transition-colors">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Modifiers Display */}
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <div className="flex flex-col mt-0.5 space-y-0.5">
                                {item.selectedModifiers.map((mod, midx) => (
                                  <span key={midx} className="text-[10px] text-gray-400 leading-tight block">
                                    + {mod.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Note Display */}
                            {item.notes && (
                              <span className="text-[10px] text-yellow-400 leading-tight block mt-0.5 flex gap-1">
                                <MessageSquare className="w-3 h-3" /> {item.notes}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold text-white text-sm">
                            {formatPrice((item.product.price + (item.selectedModifiers?.reduce((a, b) => a + b.price, 0) || 0)) * item.quantity)}
                          </span>
                          <button
                            onClick={() => removeFromTicket(index)}
                            className="text-red-400 text-[10px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Breakdown */}
              <div className="bg-[#2e2e2e] p-4 border-t border-white/5 space-y-2 relative z-10 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                {/* SPLIT BILL UI */}
                {activeOrder?.covers && activeOrder.covers > 1 && (
                  <div className="flex justify-between items-center text-xs text-blue-300 bg-blue-500/10 p-2 rounded mb-2 border border-blue-500/20">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Dividir ({activeOrder.covers})</span>
                    <span className="font-bold">{formatPrice(total / activeOrder.covers)} / pers</span>
                  </div>
                )}

                <div className="flex justify-between text-xs text-gray-500">
                  <span>Neto</span>
                  <span>{formatPrice(net)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 border-b border-white/5 pb-2">
                  <span>IVA (19%)</span>
                  <span>{formatPrice(iva)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-gray-300 pt-1">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>

                {/* TIPS SECTION */}
                {/* TIPS SECTION - REMOVED LEGACY BUTTONS */}
                {/* Tip is now handled in PaymentModal per payment */}
                <div className="flex justify-between text-sm text-toast-green items-center mt-2 pt-2 border-t border-white/5 border-dashed">
                  <span>Propinas Recaudadas</span>
                  {/* Show total collected tip from payments */}
                  <span>{formatPrice(activeOrder?.payments?.reduce((acc, p) => acc + p.tip, 0) || 0)}</span>
                </div>

                <div className="flex justify-between text-xl font-bold text-white mt-1 pt-2 border-t border-white/10">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              {/* ACTION BAR */}
              <div className="p-3 bg-toast-charcoal-dark grid grid-cols-3 gap-3 border-t border-white/10">
                <ActionButton color="red" label="GUARDAR" onClick={() => handleSaveOrder(true)} />
                <ActionButton color="gray" label="ENVIAR" onClick={handleMarchar} />
                <ActionButton color="orange" label="PAGAR" onClick={handlePay} />
              </div>
            </div>

            {/* RIGHT: MENU GRID */}
            <div className="w-full md:col-span-8 flex flex-col gap-3 h-full overflow-hidden">
              {/* Breadcrumbs / Categories */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {categories?.slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map((cat) => (
                  <CategoryTab
                    key={cat.id}
                    label={cat.name}
                    active={activeCategoryId === cat.id}
                    onClick={() => setActiveCategoryId(cat.id!)}
                  />
                ))}
                {!categories && <div className="text-white">Cargando categorías...</div>}
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-2 small:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 h-full pb-[80px] overflow-y-auto pr-1 content-start">
                {products?.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => handleProductClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    // STOCK VISUAL FEEDBACK
                    disabled={isProductOutOfStock(item)}
                    className={`active:scale-95 transition-all text-white border rounded-md shadow-sm flex flex-col items-center justify-center gap-1 p-2 relative group overflow-hidden h-[100px]
                            ${item.isAvailable === false
                        ? 'bg-[#1a1a1a] border-white/5 opacity-60 cursor-not-allowed'
                        : isProductOutOfStock(item)
                          ? 'bg-red-900/20 border-red-500/50 cursor-not-allowed grayscale' // No Stock Style
                          : 'bg-toast-charcoal-light active:bg-white/10 hover:bg-[#4a4a4a] border-white/5'}`}
                  >
                    {/* OUT OF STOCK OVERLAY */}
                    {isProductOutOfStock(item) && item.isAvailable !== false && (
                      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
                        <span className="text-red-500 font-bold border-2 border-red-500 px-2 py-1 -rotate-12 bg-black/80 text-xs text-center leading-tight">
                          {(item.stock || 0) <= 0 ? 'SIN STOCK' : 'INGREDIENTES FALTANTES'}
                        </span>
                      </div>
                    )}

                    {item.isAvailable === false ? (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40">
                          <span className="text-red-500 font-extrabold text-xl -rotate-12 border-2 border-red-500 px-2 py-1 rounded opacity-80">AGOTADO</span>
                        </div>
                        <span className="font-semibold text-md text-center leading-tight z-10 px-1 opacity-40">{item.name}</span>
                      </>
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <span className="font-semibold text-md text-center leading-tight z-10 px-1">{item.name}</span>
                        <span className="text-xs text-toast-text-gray font-light z-10">
                          {formatPrice(item.price)}
                        </span>
                      </>
                    )}
                  </button>
                ))}

                {!products ? (
                  <div className="col-span-full text-center text-gray-500 py-10">Cargando productos...</div>
                ) : products.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 gap-4">
                    <p className="text-gray-400">No hay productos en esta categoría.</p>

                    {/* DEBUG PANEL */}
                    <div className="bg-red-900/20 border border-red-500/50 p-4 rounded text-left text-xs font-mono text-red-200 w-full max-w-md">
                      <p className="font-bold underline mb-2">DIAGNÓSTICO DE ERROR:</p>
                      <p>Cat. Activa ID: {activeCategoryId}</p>
                      {categories?.find(c => c.id === activeCategoryId) && (
                        <p>Cat. Nombre: "{categories.find(c => c.id === activeCategoryId)?.name}"</p>
                      )}
                      <hr className="border-red-500/30 my-2" />
                      <p>Total Productos (Global): {
                        // We can't access global count easily here without another query, 
                        // so let's just show a hint.
                        "Verificando..."
                      }</p>
                      <button
                        onClick={async () => {
                          const sample = await db.products.toArray();
                          alert(`Total DB: ${sample.length}\nEjemplo 1: ${JSON.stringify(sample[0])}\nEjemplo 2: ${JSON.stringify(sample[1])}`);
                        }}
                        className="mt-2 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        Ver Datos Crudos (Alert)
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Empty Slots Filler (if not enough products) */}
                {products && products.length < 12 && [...Array(12 - products.length)].map((_, i) => (
                  <div key={`empty-${i}`} className="bg-transparent border border-white/5 rounded-md border-dashed opacity-20 h-[100px]"></div>
                ))}
              </div>
            </div>

          </div>

          {notification && (
            <div className="fixed top-20 right-4 bg-gray-800 border border-white/10 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-4 animate-in fade-in slide-in-from-top-5 duration-300">
              <Bell className="w-6 h-6 text-toast-orange" />
              <div>
                <p className="font-bold text-sm uppercase tracking-wider text-toast-orange">Notificación</p>
                <p className="font-medium text-sm">{notification}</p>
              </div>
            </div>
          )}

          {/* MOBILE FLOATING ACTION BUTTON (View Ticket) */}
          {!showMobileTicket && ticket.length > 0 && (
            <button
              onClick={() => setShowMobileTicket(true)}
              className="md:hidden fixed bottom-4 left-4 right-4 bg-toast-orange text-white py-4 rounded-xl shadow-2xl z-50 flex items-center justify-between px-6 font-bold animate-in slide-in-from-bottom-5"
            >
              <span className="bg-white/20 px-2 py-0.5 rounded text-sm">{ticket.reduce((a, b) => a + b.quantity, 0)} items</span>
              <span>Ver Pedido</span>
              <span>{formatPrice(total)}</span>
            </button>
          )}
        </>

      </main>

      {/* MODALS */}
      {/* MODALS */}
      {isPaymentModalOpen && activeOrder && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          order={activeOrder}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* NOTE MODAL */}
      {noteModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-md p-6 rounded-xl border border-white/10 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Agregar Observación</h3>
            <textarea
              autoFocus
              value={noteModal.text}
              onChange={(e) => setNoteModal({ ...noteModal, text: e.target.value })}
              className="w-full bg-black/20 text-white p-3 rounded-lg border border-white/10 h-32 focus:ring-2 ring-toast-orange outline-none resize-none"
              placeholder="Ej: Sin sal, muy cocido..."
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button onClick={handleSaveNote} className="px-6 py-2 bg-toast-orange text-white font-bold rounded-lg hover:brightness-110">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* CLOCK OUT MODAL */}
      <ClockOutModal
        isOpen={showClockOut}
        onClose={() => setShowClockOut(false)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#1a1a1a] text-white">Cargando Punto de Venta...</div>}>
      <POSContent />
    </Suspense>
  );
}

// --- MICRO COMPONENTS ---

function NavItem({ icon, label, active = false, badge = 0, onClick }: { icon: any, label: string, active?: boolean, badge?: number, onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center w-full py-3 rounded-xl transition-all duration-200 group cursor-pointer
            ${active ? 'bg-gradient-to-b from-white/10 to-transparent text-toast-orange shadow-inner border border-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
      <div className={`w-5 h-5 mb-1 transition-transform group-active:scale-90 ${active ? 'text-toast-orange drop-shadow-lg' : ''}`}>{icon}</div>
      <span className={`text-[9px] font-bold tracking-wider uppercase ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>

      {/* Active Indicator Bar */}
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 bg-toast-orange rounded-r-md"></div>}

      {badge > 0 && (
        <span className="absolute top-1 right-2 bg-toast-red text-white text-[9px] font-bold w-3 h-3 rounded-full flex items-center justify-center border border-toast-charcoal-dark">
          {badge}
        </span>
      )}
    </div>
  )
}

function CategoryTab({ label, active, onClick }: { label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 rounded-t-lg font-bold tracking-wide text-sm border-b-4 transition-colors min-w-[100px]
            ${active
          ? 'bg-toast-charcoal text-white border-toast-orange'
          : 'bg-toast-charcoal-dark text-gray-500 border-transparent hover:bg-[#2e2e2e] hover:text-gray-300'}`}>
      {label}
    </button>
  )
}

function ActionButton({ color, label, onClick }: { color: 'red' | 'orange' | 'gray', label: string, onClick?: () => void }) {
  const styles = {
    red: 'bg-toast-charcoal-dark text-toast-red border-toast-red hover:bg-toast-red/10',
    orange: 'bg-toast-orange text-white border-toast-orange hover:brightness-110 shadow-lg shadow-orange-500/20',
    gray: 'bg-toast-charcoal-light text-white border-transparent hover:bg-[#555]'
  };

  return (
    <button
      onClick={onClick}
      className={`${styles[color]} border-2 py-4 rounded-lg font-bold text-lg tracking-wide uppercase transition-all active:scale-95 flex items-center justify-center`}
    >
      {label}
    </button>
  )
}
