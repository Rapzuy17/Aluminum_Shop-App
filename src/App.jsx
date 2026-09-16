import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, SHOP_DATA_ROW_ID } from "./supabaseClient";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

const JOB_TYPES = ["Window", "Door", "Screen", "Mixed", "Other"];
const CATEGORIES = ["Aluminum", "Glass", "Hardware", "Screen mesh", "Other"];
const PIECE_TYPES = ["Window", "Door", "Screen", "Other"];
const UNITS = ["pcs", "m", "sqft", "box", "kg", "roll"];
const PIECE_COLORS = {
  Window: { bg: "#E3ECF5", text: "#2C4E70" },
  Door: { bg: "#F0E6D8", text: "#7A5227" },
  Screen: { bg: "#E3ECDD", text: "#3F6B33" },
  Other: { bg: "#EAE5D6", text: "#6B6552" },
};
const CAT_COLORS = {
  Aluminum: { bg: "#E4E9EC", text: "#3C5766" },
  Glass: { bg: "#DCEBF2", text: "#1F5A73" },
  Hardware: { bg: "#EFE7D8", text: "#7A5A22" },
  "Screen mesh": { bg: "#E3ECDD", text: "#3F6B33" },
  Other: { bg: "#EAE5D6", text: "#6B6552" },
};

function daysBetween(a, b) {
  const ms = new Date(b + "T00:00:00") - new Date(a + "T00:00:00");
  return Math.round(ms / 86400000);
}
function fmtMoney(n, currency) {
  const v = Number.isFinite(n) ? n : 0;
  return `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const emptyJob = () => ({
  id: uid(),
  customer: "",
  jobType: "Window",
  deliveryDate: "",
  currency: "₱",
  budget: 0,
  createdAt: todayISO(),
  materials: [],
  labor: [],
  pieces: [],
  orders: { Window: 0, Door: 0, Screen: 0, Other: 0 },
});

const emptyInvItem = () => ({ id: uid(), name: "", category: "Aluminum", unit: "pcs", qty: 0, reorderLevel: 0, costPerUnit: 0 });

export default function JobTracker() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard"); // dashboard | jobs | inventory
  const [jobs, setJobs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("materials");
  const [showNewJob, setShowNewJob] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");

  const [matForm, setMatForm] = useState({ category: "Aluminum", item: "", cost: "", date: todayISO() });
  const [laborForm, setLaborForm] = useState({ worker: "", rate: "", days: "1", date: todayISO() });
  const [pieceForm, setPieceForm] = useState({ type: "Window", qty: "1", label: "" });
  const [newJobForm, setNewJobForm] = useState({ customer: "", jobType: "Window", deliveryDate: "", budget: "" });
  const [invForm, setInvForm] = useState(emptyInvItem());

  const [matError, setMatError] = useState("");
  const [matWarning, setMatWarning] = useState("");
  const [confirmClearMaterials, setConfirmClearMaterials] = useState(false);
  const [laborError, setLaborError] = useState("");
  const [laborWarning, setLaborWarning] = useState("");
  const [pieceError, setPieceError] = useState("");
  const [jobError, setJobError] = useState("");
  const [invError, setInvError] = useState("");

  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [editingOrders, setEditingOrders] = useState(false);
  const [orderDraft, setOrderDraft] = useState({ Window: "", Door: "", Screen: "", Other: "" });

  const jobsRef = useRef([]);
  const inventoryRef = useRef([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from("shop_data")
          .select("data")
          .eq("id", SHOP_DATA_ROW_ID)
          .single();
        if (fetchErr) throw fetchErr;
        const list = Array.isArray(data?.data?.jobs) ? data.data.jobs : [];
        const invList = Array.isArray(data?.data?.inventory) ? data.data.inventory : [];
        setJobs(list);
        setInventory(invList);
        setActiveId(list.length ? list[0].id : null);
        setView(list.length ? "dashboard" : "jobs");
      } catch (e) {
        setError("Couldn't load shared data. Check your Supabase setup (see README).");
        setView("jobs");
      }
      setLoaded(true);
    })();

    // Live sync: if the other phone changes data, pull it in here too.
    const channel = supabase
      .channel("shop_data_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shop_data", filter: `id=eq.${SHOP_DATA_ROW_ID}` },
        (payload) => {
          const next = payload.new?.data;
          if (!next) return;
          if (Array.isArray(next.jobs)) setJobs(next.jobs);
          if (Array.isArray(next.inventory)) setInventory(next.inventory);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const persistJobs = useCallback(async (nextJobs) => {
    setSaveState("saving");
    try {
      const { error: upErr } = await supabase
        .from("shop_data")
        .update({ data: { jobs: nextJobs, inventory: inventoryRef.current }, updated_at: new Date().toISOString() })
        .eq("id", SHOP_DATA_ROW_ID);
      if (upErr) throw upErr;
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1000);
    } catch (e) {
      setSaveState("error");
      setError("Couldn't save to the shared database. Check your connection and Supabase setup.");
    }
  }, []);

  const persistInventory = useCallback(async (nextInv) => {
    setSaveState("saving");
    try {
      const { error: upErr } = await supabase
        .from("shop_data")
        .update({ data: { jobs: jobsRef.current, inventory: nextInv }, updated_at: new Date().toISOString() })
        .eq("id", SHOP_DATA_ROW_ID);
      if (upErr) throw upErr;
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1000);
    } catch (e) {
      setSaveState("error");
      setError("Couldn't save to the shared database. Check your connection and Supabase setup.");
    }
  }, []);

  const updateJobs = (updater) => {
    setJobs((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistJobs(next);
      return next;
    });
  };

  const updateInventory = (updater) => {
    setInventory((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistInventory(next);
      return next;
    });
  };

  const active = jobs.find((j) => j.id === activeId) || null;

  const openJob = (id) => {
    setActiveId(id);
    setView("jobs");
    setTab("materials");
  };

  const createJob = () => {
    const customer = newJobForm.customer.trim();
    if (!customer) {
      setJobError("Enter a customer or job name.");
      return;
    }
    if (!newJobForm.deliveryDate) {
      setJobError("Pick a delivery date.");
      return;
    }
    const j = emptyJob();
    j.customer = customer;
    j.jobType = newJobForm.jobType;
    j.deliveryDate = newJobForm.deliveryDate;
    j.currency = "₱";
    const budgetVal = parseFloat(newJobForm.budget);
    j.budget = !isNaN(budgetVal) && budgetVal > 0 ? budgetVal : 0;
    updateJobs((prev) => [...prev, j]);
    setActiveId(j.id);
    setNewJobForm({ customer: "", jobType: "Window", deliveryDate: "", budget: "" });
    setJobError("");
    setShowNewJob(false);
    setView("jobs");
    setTab("materials");
  };

  const deleteJob = (id) => {
    updateJobs((prev) => prev.filter((j) => j.id !== id));
    if (activeId === id) {
      const remaining = jobs.filter((j) => j.id !== id);
      setActiveId(remaining.length ? remaining[0].id : null);
    }
  };

  const addMaterial = () => {
    const cost = parseFloat(matForm.cost);
    if (!matForm.item.trim()) {
      setMatError("Enter what was bought.");
      return;
    }
    if (!matForm.cost || isNaN(cost) || cost < 0) {
      setMatError("Enter a valid cost.");
      return;
    }
    if (!matForm.date) {
      setMatError("Pick a date.");
      return;
    }
    const entry = { id: uid(), category: matForm.category, item: matForm.item.trim(), cost, date: matForm.date };
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, materials: [entry, ...j.materials] } : j)));
    setMatForm({ category: matForm.category, item: "", cost: "", date: todayISO() });
    setMatError("");
    setMatWarning("");
  };

  const addLabor = () => {
    const rate = parseFloat(laborForm.rate);
    const days = parseFloat(laborForm.days);
    if (!laborForm.worker.trim()) {
      setLaborError("Enter the worker's name.");
      return;
    }
    if (!laborForm.rate || isNaN(rate) || rate < 0) {
      setLaborError("Enter a valid daily rate.");
      return;
    }
    if (!laborForm.days || isNaN(days) || days <= 0) {
      setLaborError("Enter days worked (more than 0).");
      return;
    }
    if (!laborForm.date) {
      setLaborError("Pick a date.");
      return;
    }
    const entry = { id: uid(), worker: laborForm.worker.trim(), rate, days, date: laborForm.date };
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, labor: [entry, ...j.labor] } : j)));
    setLaborForm({ worker: "", rate: "", days: "1", date: todayISO() });
    setLaborError("");
    setLaborWarning("");
  };

  const removeMaterial = (id) => {
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, materials: j.materials.filter((m) => m.id !== id) } : j)));
  };

  const clearAllMaterials = () => {
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, materials: [] } : j)));
    setConfirmClearMaterials(false);
  };

  const removeLabor = (id) => {
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, labor: j.labor.filter((l) => l.id !== id) } : j)));
  };

  const addPiece = () => {
    const qty = parseInt(pieceForm.qty, 10);
    if (!qty || qty <= 0) {
      setPieceError("Enter a quantity of 1 or more.");
      return;
    }
    const entry = { id: uid(), type: pieceForm.type, qty, label: pieceForm.label.trim() };
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, pieces: [entry, ...(j.pieces || [])] } : j)));
    setPieceForm({ type: pieceForm.type, qty: "1", label: "" });
    setPieceError("");
  };

  const removePiece = (id) => {
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, pieces: (j.pieces || []).filter((p) => p.id !== id) } : j)));
  };

  const startEditOrders = () => {
    const cur = (active && active.orders) || {};
    setOrderDraft({
      Window: cur.Window ? String(cur.Window) : "",
      Door: cur.Door ? String(cur.Door) : "",
      Screen: cur.Screen ? String(cur.Screen) : "",
      Other: cur.Other ? String(cur.Other) : "",
    });
    setEditingOrders(true);
  };

  const saveOrders = () => {
    const next = {};
    PIECE_TYPES.forEach((t) => {
      const n = parseInt(orderDraft[t], 10);
      next[t] = !isNaN(n) && n > 0 ? n : 0;
    });
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, orders: next } : j)));
    setEditingOrders(false);
  };

  const saveDate = () => {
    if (!dateDraft) return;
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, deliveryDate: dateDraft } : j)));
    setEditingDate(false);
  };

  const saveBudget = () => {
    const val = parseFloat(budgetDraft);
    const clean = !isNaN(val) && val >= 0 ? val : 0;
    updateJobs((prev) => prev.map((j) => (j.id === active.id ? { ...j, budget: clean } : j)));
    setEditingBudget(false);
  };

  const addInvItem = () => {
    if (!invForm.name.trim()) {
      setInvError("Enter an item name.");
      return;
    }
    const qty = parseFloat(invForm.qty);
    const reorder = parseFloat(invForm.reorderLevel);
    const cost = parseFloat(invForm.costPerUnit);
    const item = {
      id: uid(),
      name: invForm.name.trim(),
      category: invForm.category,
      unit: invForm.unit,
      qty: isNaN(qty) ? 0 : qty,
      reorderLevel: isNaN(reorder) ? 0 : reorder,
      costPerUnit: isNaN(cost) ? 0 : cost,
    };
    updateInventory((prev) => [item, ...prev]);
    setInvForm(emptyInvItem());
    setInvError("");
  };

  const adjustInvQty = (id, delta) => {
    updateInventory((prev) => prev.map((it) => (it.id === id ? { ...it, qty: Math.max(0, Math.round((it.qty + delta) * 100) / 100) } : it)));
  };

  const removeInvItem = (id) => {
    updateInventory((prev) => prev.filter((it) => it.id !== id));
  };

  if (!loaded) {
    return (
      <div style={{ fontFamily: "var(--jt-sans)", padding: "3rem 1rem", textAlign: "center", color: "#8A8578" }}>Loading…</div>
    );
  }

  const materialsTotal = active ? active.materials.reduce((s, m) => s + m.cost, 0) : 0;
  const laborTotal = active ? active.labor.reduce((s, l) => s + l.rate * l.days, 0) : 0;
  const grandTotal = materialsTotal + laborTotal;
  const daysLeft = active ? daysBetween(todayISO(), active.deliveryDate) : null;

  const categoryTotals = active
    ? CATEGORIES.map((c) => ({ cat: c, total: active.materials.filter((m) => m.category === c).reduce((s, m) => s + m.cost, 0) })).filter((c) => c.total > 0)
    : [];

  const activePieces = active ? active.pieces || [] : [];
  const activeOrders = active ? active.orders || {} : {};
  const piecesQty = activePieces.reduce((s, p) => s + p.qty, 0);
  const pieceProgress = PIECE_TYPES.map((t) => ({
    type: t,
    made: activePieces.filter((p) => p.type === t).reduce((s, p) => s + p.qty, 0),
    ordered: activeOrders[t] || 0,
  })).filter((p) => p.ordered > 0 || p.made > 0);
  const hasOrders = PIECE_TYPES.some((t) => (activeOrders[t] || 0) > 0);
  const costPerPiece = piecesQty > 0 ? grandTotal / piecesQty : null;

  const hasBudget = active && active.budget > 0;
  const remaining = hasBudget ? active.budget - grandTotal : 0;
  const spentRatio = hasBudget ? Math.min(1, grandTotal / active.budget) : 0;
  const budgetTone = !hasBudget
    ? null
    : remaining < 0
    ? { label: "Over budget", color: "#8A2E1E", bg: "#F5DCD3", bar: "#C24B22" }
    : spentRatio >= 0.85
    ? { label: "Remaining", color: "#8A5A12", bg: "#F5E7C9", bar: "#D9A73B" }
    : { label: "Remaining", color: "#2F5C3B", bg: "#DDEBDF", bar: "#4B8A5C" };

  const dateTone =
    daysLeft === null
      ? { label: "", color: "#8A8578", bg: "#F0EDE3" }
      : daysLeft < 0
      ? { label: `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue`, color: "#8A2E1E", bg: "#F5DCD3" }
      : daysLeft === 0
      ? { label: "Due today", color: "#8A5A12", bg: "#F5E7C9" }
      : daysLeft <= 5
      ? { label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, color: "#8A5A12", bg: "#F5E7C9" }
      : { label: `${daysLeft} days left`, color: "#2F5C3B", bg: "#DDEBDF" };

  // ---- Dashboard aggregates ----
  const allSpent = jobs.reduce((s, j) => s + j.materials.reduce((a, m) => a + m.cost, 0) + j.labor.reduce((a, l) => a + l.rate * l.days, 0), 0);
  const budgetedJobs = jobs.filter((j) => j.budget > 0);
  const allBudget = budgetedJobs.reduce((s, j) => s + j.budget, 0);
  const allBudgetSpent = budgetedJobs.reduce((s, j) => s + j.materials.reduce((a, m) => a + m.cost, 0) + j.labor.reduce((a, l) => a + l.rate * l.days, 0), 0);
  const overBudgetJobs = budgetedJobs.filter((j) => {
    const spent = j.materials.reduce((a, m) => a + m.cost, 0) + j.labor.reduce((a, l) => a + l.rate * l.days, 0);
    return spent > j.budget;
  });
  const lowStock = inventory.filter((it) => it.qty <= it.reorderLevel);
  const upcomingJobs = [...jobs]
    .filter((j) => j.deliveryDate)
    .sort((a, b) => new Date(a.deliveryDate) - new Date(b.deliveryDate));

  return (
    <div
      style={{
        fontFamily: "var(--jt-sans)",
        color: "#26231C",
        background: "#F5F2EA",
        borderRadius: 14,
        border: "1px solid #DFDACB",
        overflow: "hidden",
        maxWidth: 760,
        margin: "0 auto",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');
        :root { --jt-sans: 'Inter', system-ui, sans-serif; --jt-display: 'Archivo', system-ui, sans-serif; --jt-mono: 'IBM Plex Mono', monospace; }
        .jt-btn { font-family: var(--jt-sans); cursor: pointer; border: none; }
        .jt-btn:active { transform: scale(0.98); }
        .jt-input { font-family: var(--jt-sans); border: 1px solid #D8D2C0; border-radius: 6px; padding: 8px 10px; font-size: 14px; background: #FFFDF8; color: #26231C; width: 100%; box-sizing: border-box; }
        .jt-input:focus { outline: none; border-color: #2E6B8F; box-shadow: 0 0 0 2px rgba(46,107,143,0.15); }
        .jt-tab { font-family: var(--jt-sans); font-size: 14px; padding: 8px 16px; border: none; background: none; cursor: pointer; color: #8A8578; border-bottom: 2px solid transparent; }
        .jt-tab.active { color: #1F3A4D; border-bottom-color: #2E6B8F; font-weight: 500; }
        .jt-nav { font-family: var(--jt-display); font-size: 13px; font-weight: 600; padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: #B9CBD6; }
        .jt-nav.active { background: #2E6B8F; color: #FFF; }
        .jt-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #EAE5D6; }
        .jt-row:last-child { border-bottom: none; }
        .jt-del { background: none; border: none; color: #B0AA98; cursor: pointer; font-size: 12px; padding: 4px 8px; }
        .jt-del:hover { color: #8A2E1E; }
        .jt-chip { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px; display: inline-block; }
        .jt-stat { background: #FFFDF8; border: 1px solid #EAE5D6; border-radius: 8px; padding: 12px 14px; min-width: 0; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#1F3A4D", color: "#F5F2EA", padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontFamily: "var(--jt-display)", fontWeight: 700, fontSize: 18, letterSpacing: "0.01em" }}>Aluminum & Glass Job Tracker</div>
          {saveState === "saving" && <span style={{ fontSize: 12, color: "#B9CBD6" }}>Saving…</span>}
          {saveState === "error" && <span style={{ fontSize: 12, color: "#E8A491" }}>Save failed</span>}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          <button className={`jt-nav ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
            Dashboard
          </button>
          <button className={`jt-nav ${view === "jobs" ? "active" : ""}`} onClick={() => setView("jobs")}>
            Jobs
          </button>
          <button className={`jt-nav ${view === "inventory" ? "active" : ""}`} onClick={() => setView("inventory")}>
            Inventory
          </button>
        </div>

        {view === "jobs" && jobs.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={activeId || ""}
              onChange={(e) => openJob(e.target.value)}
              className="jt-input"
              style={{ maxWidth: 260, background: "#294C63", color: "#F5F2EA", border: "1px solid #3E6178" }}
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id} style={{ color: "#26231C" }}>
                  {j.customer} — {j.jobType}
                </option>
              ))}
            </select>
            <button className="jt-btn" onClick={() => setShowNewJob((s) => !s)} style={{ background: "#2E6B8F", color: "#FFF", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500 }}>
              + New job
            </button>
            {active && (
              <button className="jt-btn" onClick={() => deleteJob(active.id)} style={{ background: "transparent", color: "#E8A491", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
                Delete job
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------------- DASHBOARD VIEW ---------------- */}
      {view === "dashboard" && (
        <div style={{ padding: "20px" }}>
          {jobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px" }}>
              <div style={{ fontFamily: "var(--jt-display)", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No jobs yet</div>
              <div style={{ color: "#8A8578", fontSize: 14, marginBottom: 14 }}>Create your first job to start tracking materials, labor, and pieces.</div>
              <button
                className="jt-btn"
                onClick={() => {
                  setView("jobs");
                  setShowNewJob(true);
                }}
                style={{ background: "#1F3A4D", color: "#fff", borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 500 }}
              >
                + New job
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                <div className="jt-stat">
                  <div style={{ fontSize: 12, color: "#8A8578" }}>Active jobs</div>
                  <div style={{ fontFamily: "var(--jt-mono)", fontSize: 18, fontWeight: 500, color: "#1F3A4D", marginTop: 2 }}>{jobs.length}</div>
                </div>
                <div className="jt-stat">
                  <div style={{ fontSize: 12, color: "#8A8578" }}>Total spent</div>
                  <div style={{ fontFamily: "var(--jt-mono)", fontSize: 16, fontWeight: 500, color: "#1F3A4D", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtMoney(allSpent, "₱")}
                  </div>
                </div>
                <div className="jt-stat">
                  <div style={{ fontSize: 12, color: "#8A8578" }}>Budget remaining</div>
                  <div style={{ fontFamily: "var(--jt-mono)", fontSize: 16, fontWeight: 500, color: allBudget - allBudgetSpent < 0 ? "#8A2E1E" : "#2F5C3B", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {allBudget > 0 ? fmtMoney(allBudget - allBudgetSpent, "₱") : "—"}
                  </div>
                </div>
                <div className="jt-stat">
                  <div style={{ fontSize: 12, color: "#8A8578" }}>Low stock items</div>
                  <div style={{ fontFamily: "var(--jt-mono)", fontSize: 18, fontWeight: 500, color: lowStock.length > 0 ? "#8A2E1E" : "#1F3A4D", marginTop: 2 }}>{lowStock.length}</div>
                </div>
              </div>

              {overBudgetJobs.length > 0 && (
                <div style={{ background: "#F5DCD3", color: "#8A2E1E", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>
                  {overBudgetJobs.length} job{overBudgetJobs.length === 1 ? " is" : "s are"} over budget: {overBudgetJobs.map((j) => j.customer).join(", ")}
                </div>
              )}

              <div style={{ fontFamily: "var(--jt-display)", fontWeight: 600, fontSize: 14, color: "#1F3A4D", marginTop: 20, marginBottom: 8 }}>
                Jobs by delivery date
              </div>
              <div>
                {upcomingJobs.map((j) => {
                  const dl = daysBetween(todayISO(), j.deliveryDate);
                  const spent = j.materials.reduce((a, m) => a + m.cost, 0) + j.labor.reduce((a, l) => a + l.rate * l.days, 0);
                  const tone =
                    dl < 0
                      ? { color: "#8A2E1E", bg: "#F5DCD3", label: `${Math.abs(dl)}d overdue` }
                      : dl <= 5
                      ? { color: "#8A5A12", bg: "#F5E7C9", label: `${dl}d left` }
                      : { color: "#2F5C3B", bg: "#DDEBDF", label: `${dl}d left` };
                  return (
                    <div
                      key={j.id}
                      onClick={() => openJob(j.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: "1px solid #EAE5D6", marginBottom: 6, background: "#FFFDF8" }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{j.customer}</div>
                        <div style={{ fontSize: 12, color: "#8A8578" }}>
                          {j.jobType} · {fmtMoney(spent, j.currency)} spent
                        </div>
                      </div>
                      <span style={{ background: tone.bg, color: tone.color, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>{tone.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- JOBS VIEW ---------------- */}
      {view === "jobs" && (
        <>
          {(showNewJob || jobs.length === 0) && (
            <div style={{ padding: "20px", background: "#FFFDF8", borderBottom: "1px solid #DFDACB" }}>
              <div style={{ fontFamily: "var(--jt-display)", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>{jobs.length === 0 ? "Start your first job" : "New job"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 10 }}>
                <input className="jt-input" placeholder="Customer or job name, e.g. Dela Cruz Residence" value={newJobForm.customer} onChange={(e) => setNewJobForm((f) => ({ ...f, customer: e.target.value }))} />
                <select className="jt-input" value={newJobForm.jobType} onChange={(e) => setNewJobForm((f) => ({ ...f, jobType: e.target.value }))}>
                  {JOB_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <input className="jt-input" type="date" value={newJobForm.deliveryDate} onChange={(e) => setNewJobForm((f) => ({ ...f, deliveryDate: e.target.value }))} />
                <input className="jt-input" type="number" min="0" step="0.01" placeholder="Budget (optional)" value={newJobForm.budget} onChange={(e) => setNewJobForm((f) => ({ ...f, budget: e.target.value }))} />
              </div>
              {jobError && <div style={{ color: "#8A2E1E", fontSize: 13, marginTop: 8 }}>{jobError}</div>}
              {!jobError && !isNaN(parseFloat(newJobForm.budget)) && parseFloat(newJobForm.budget) >= 5000000 && (
                <div style={{ color: "#8A5A12", fontSize: 13, marginTop: 8 }}>That's a large budget — check for an extra digit.</div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="jt-btn" onClick={createJob} style={{ background: "#1F3A4D", color: "#FFF", borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 500 }}>
                  Create job
                </button>
                {jobs.length > 0 && (
                  <button
                    className="jt-btn"
                    onClick={() => {
                      setShowNewJob(false);
                      setJobError("");
                    }}
                    style={{ background: "none", color: "#8A8578", padding: "9px 10px", fontSize: 13 }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {active && (
            <>
              {/* Job summary */}
              <div style={{ padding: "18px 20px", borderBottom: "1px solid #DFDACB" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--jt-display)", fontWeight: 700, fontSize: 20, color: "#1F3A4D" }}>{active.customer}</div>
                    <div style={{ fontSize: 13, color: "#2E6B8F", marginTop: 2, fontWeight: 500 }}>{active.jobType}</div>
                    {!editingDate ? (
                      <div style={{ fontSize: 13, color: "#8A8578", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                        Delivery: {fmtDate(active.deliveryDate)}
                        <button
                          className="jt-btn"
                          onClick={() => {
                            setDateDraft(active.deliveryDate);
                            setEditingDate(true);
                          }}
                          style={{ background: "none", color: "#2E6B8F", fontSize: 12, padding: 0 }}
                        >
                          change
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                        <input type="date" className="jt-input" style={{ width: 160 }} value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
                        <button className="jt-btn" onClick={saveDate} style={{ background: "#1F3A4D", color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                          Save
                        </button>
                        <button className="jt-btn" onClick={() => setEditingDate(false)} style={{ background: "none", color: "#8A8578", fontSize: 12 }}>
                          Cancel
                        </button>
                      </div>
                    )}
                    {active.budget > 0 ? (
                      !editingBudget ? (
                        <div style={{ fontSize: 13, color: "#8A8578", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                          Budget: {fmtMoney(active.budget, active.currency)}
                          <button
                            className="jt-btn"
                            onClick={() => {
                              setBudgetDraft(String(active.budget));
                              setEditingBudget(true);
                            }}
                            style={{ background: "none", color: "#2E6B8F", fontSize: 12, padding: 0 }}
                          >
                            change
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                            <input type="number" min="0" step="0.01" className="jt-input" style={{ width: 140 }} value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} />
                            <button className="jt-btn" onClick={saveBudget} style={{ background: "#1F3A4D", color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                              Save
                            </button>
                            <button className="jt-btn" onClick={() => setEditingBudget(false)} style={{ background: "none", color: "#8A8578", fontSize: 12 }}>
                              Cancel
                            </button>
                          </div>
                          {!isNaN(parseFloat(budgetDraft)) && parseFloat(budgetDraft) >= 5000000 && (
                            <div style={{ color: "#8A5A12", fontSize: 12, marginTop: 4 }}>That's a large budget — check for an extra digit.</div>
                          )}
                        </div>
                      )
                    ) : !editingBudget ? (
                      <button
                        className="jt-btn"
                        onClick={() => {
                          setBudgetDraft("");
                          setEditingBudget(true);
                        }}
                        style={{ background: "none", color: "#2E6B8F", fontSize: 12, padding: 0, marginTop: 4 }}
                      >
                        + Set a budget
                      </button>
                    ) : (
                      <div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                          <input type="number" min="0" step="0.01" className="jt-input" style={{ width: 140 }} placeholder="Budget amount" value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} />
                          <button className="jt-btn" onClick={saveBudget} style={{ background: "#1F3A4D", color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                            Save
                          </button>
                          <button className="jt-btn" onClick={() => setEditingBudget(false)} style={{ background: "none", color: "#8A8578", fontSize: 12 }}>
                            Cancel
                          </button>
                        </div>
                        {!isNaN(parseFloat(budgetDraft)) && parseFloat(budgetDraft) >= 5000000 && (
                          <div style={{ color: "#8A5A12", fontSize: 12, marginTop: 4 }}>That's a large budget — check for an extra digit.</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ background: dateTone.bg, color: dateTone.color, borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>{dateTone.label}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
                  <div className="jt-stat">
                    <div style={{ fontSize: 12, color: "#8A8578" }}>Materials</div>
                    <div style={{ fontFamily: "var(--jt-mono)", fontSize: 18, fontWeight: 500, color: "#1F3A4D", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={fmtMoney(materialsTotal, active.currency)}>
                      {fmtMoney(materialsTotal, active.currency)}
                    </div>
                  </div>
                  <div className="jt-stat">
                    <div style={{ fontSize: 12, color: "#8A8578" }}>Labor</div>
                    <div style={{ fontFamily: "var(--jt-mono)", fontSize: 18, fontWeight: 500, color: "#1F3A4D", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={fmtMoney(laborTotal, active.currency)}>
                      {fmtMoney(laborTotal, active.currency)}
                    </div>
                  </div>
                  <div style={{ background: "#1F3A4D", borderRadius: 8, padding: "12px 14px", minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#B9CBD6" }}>Total spent</div>
                    <div style={{ fontFamily: "var(--jt-mono)", fontSize: 18, fontWeight: 500, color: "#FFF", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={fmtMoney(grandTotal, active.currency)}>
                      {fmtMoney(grandTotal, active.currency)}
                    </div>
                    {costPerPiece !== null && <div style={{ fontSize: 11, color: "#B9CBD6", marginTop: 3 }}>≈ {fmtMoney(costPerPiece, active.currency)} per piece</div>}
                  </div>
                </div>

                {hasBudget && (
                  <div className="jt-stat" style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, color: "#8A8578" }}>{budgetTone.label === "Over budget" ? "Over budget by" : "Remaining budget"}</span>
                      <span style={{ fontFamily: "var(--jt-mono)", fontSize: 16, fontWeight: 500, color: budgetTone.color }}>{fmtMoney(Math.abs(remaining), active.currency)}</span>
                    </div>
                    <div style={{ background: "#EAE5D6", borderRadius: 4, height: 8, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(spentRatio * 100)}%`, height: "100%", background: budgetTone.bar, borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 12, color: "#8A8578", marginTop: 6 }}>
                      {fmtMoney(grandTotal, active.currency)} spent of {fmtMoney(active.budget, active.currency)} budget
                    </div>
                  </div>
                )}

                {categoryTotals.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {categoryTotals.map(({ cat, total }) => (
                      <span key={cat} className="jt-chip" style={{ background: CAT_COLORS[cat].bg, color: CAT_COLORS[cat].text }}>
                        {cat}: {fmtMoney(total, active.currency)}
                      </span>
                    ))}
                  </div>
                )}

                {pieceProgress.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#8A8578" }}>{hasOrders ? "Order progress:" : "Pieces made:"}</span>
                    {pieceProgress.map(({ type, made, ordered }) => {
                      const done = ordered > 0 && made >= ordered;
                      const label = ordered > 0 ? `${type}: ${made}/${ordered}` : `${type}: ${made}`;
                      const tone = done ? { bg: "#DDEBDF", text: "#2F5C3B" } : ordered > 0 ? { bg: "#F5E7C9", text: "#8A5A12" } : PIECE_COLORS[type];
                      return (
                        <span key={type} className="jt-chip" style={{ background: tone.bg, color: tone.text }}>
                          {label}
                          {done ? " ✓" : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #DFDACB", background: "#FFFDF8", padding: "0 20px" }}>
                <button className={`jt-tab ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")}>
                  Materials ({active.materials.length})
                </button>
                <button className={`jt-tab ${tab === "labor" ? "active" : ""}`} onClick={() => setTab("labor")}>
                  Worker pay ({active.labor.length})
                </button>
                <button className={`jt-tab ${tab === "pieces" ? "active" : ""}`} onClick={() => setTab("pieces")}>
                  Pieces ({piecesQty})
                </button>
              </div>

              {/* Materials tab */}
              {tab === "materials" && (
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.6fr 0.9fr 1fr auto", gap: 8, alignItems: "start" }}>
                    <select className="jt-input" value={matForm.category} onChange={(e) => setMatForm((f) => ({ ...f, category: e.target.value }))}>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input className="jt-input" placeholder="e.g. 6063 aluminum frame, 6m" value={matForm.item} onChange={(e) => setMatForm((f) => ({ ...f, item: e.target.value }))} />
                    <input
                      className="jt-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Cost"
                      value={matForm.cost}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMatForm((f) => ({ ...f, cost: val }));
                        const n = parseFloat(val);
                        setMatWarning(!isNaN(n) && n >= 100000 ? "That's a large cost for one item — check for an extra digit." : "");
                      }}
                    />
                    <input className="jt-input" type="date" value={matForm.date} onChange={(e) => setMatForm((f) => ({ ...f, date: e.target.value }))} />
                    <button className="jt-btn" onClick={addMaterial} style={{ background: "#2E6B8F", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
                      Add
                    </button>
                  </div>
                  {matError && <div style={{ color: "#8A2E1E", fontSize: 13, marginTop: 8 }}>{matError}</div>}
                  {!matError && matWarning && <div style={{ color: "#8A5A12", fontSize: 13, marginTop: 8 }}>{matWarning}</div>}

                  <div style={{ marginTop: 16 }}>
                    {active.materials.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                        {!confirmClearMaterials ? (
                          <button className="jt-btn" onClick={() => setConfirmClearMaterials(true)} style={{ background: "none", color: "#B0AA98", fontSize: 12, padding: "2px 4px" }}>
                            Clear all materials
                          </button>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <span style={{ color: "#8A2E1E" }}>Remove all {active.materials.length} entries?</span>
                            <button className="jt-btn" onClick={clearAllMaterials} style={{ background: "#8A2E1E", color: "#fff", borderRadius: 6, padding: "4px 10px" }}>
                              Yes, clear
                            </button>
                            <button className="jt-btn" onClick={() => setConfirmClearMaterials(false)} style={{ background: "none", color: "#8A8578" }}>
                              Cancel
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                    {active.materials.length === 0 ? (
                      <div style={{ color: "#8A8578", fontSize: 14, padding: "20px 0", textAlign: "center" }}>No materials logged yet. Add your first purchase above.</div>
                    ) : (
                      active.materials.map((m) => (
                        <div key={m.id} className="jt-row">
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="jt-chip" style={{ background: CAT_COLORS[m.category]?.bg || "#EAE5D6", color: CAT_COLORS[m.category]?.text || "#6B6552" }}>
                                {m.category}
                              </span>
                              <span style={{ fontSize: 14 }}>{m.item}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "#8A8578", marginTop: 3 }}>{fmtDate(m.date)}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "var(--jt-mono)", fontSize: 14 }}>{fmtMoney(m.cost, active.currency)}</span>
                            <button className="jt-del" onClick={() => removeMaterial(m.id)} aria-label={`Remove ${m.item}`}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Labor tab */}
              {tab === "labor" && (
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 1fr auto", gap: 8, alignItems: "start" }}>
                    <input className="jt-input" placeholder="Worker name" value={laborForm.worker} onChange={(e) => setLaborForm((f) => ({ ...f, worker: e.target.value }))} />
                    <input
                      className="jt-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Daily rate"
                      value={laborForm.rate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLaborForm((f) => ({ ...f, rate: val }));
                        const n = parseFloat(val);
                        setLaborWarning(!isNaN(n) && n >= 50000 ? "That's a high daily rate — check for an extra digit." : "");
                      }}
                    />
                    <input className="jt-input" type="number" min="0" step="0.5" placeholder="Days" value={laborForm.days} onChange={(e) => setLaborForm((f) => ({ ...f, days: e.target.value }))} />
                    <input className="jt-input" type="date" value={laborForm.date} onChange={(e) => setLaborForm((f) => ({ ...f, date: e.target.value }))} />
                    <button className="jt-btn" onClick={addLabor} style={{ background: "#2E6B8F", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
                      Add
                    </button>
                  </div>
                  {laborError && <div style={{ color: "#8A2E1E", fontSize: 13, marginTop: 8 }}>{laborError}</div>}
                  {!laborError && laborWarning && <div style={{ color: "#8A5A12", fontSize: 13, marginTop: 8 }}>{laborWarning}</div>}

                  <div style={{ marginTop: 16 }}>
                    {active.labor.length === 0 ? (
                      <div style={{ color: "#8A8578", fontSize: 14, padding: "20px 0", textAlign: "center" }}>No worker pay logged yet. Add an entry above.</div>
                    ) : (
                      active.labor.map((l) => (
                        <div key={l.id} className="jt-row">
                          <div>
                            <div style={{ fontSize: 14 }}>{l.worker}</div>
                            <div style={{ fontSize: 12, color: "#8A8578" }}>
                              {fmtDate(l.date)} · {fmtMoney(l.rate, active.currency)}/day × {l.days} day{l.days === 1 ? "" : "s"}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "var(--jt-mono)", fontSize: 14 }}>{fmtMoney(l.rate * l.days, active.currency)}</span>
                            <button className="jt-del" onClick={() => removeLabor(l.id)} aria-label={`Remove ${l.worker}`}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Pieces tab */}
              {tab === "pieces" && (
                <div style={{ padding: "18px 20px" }}>
                  <div className="jt-stat" style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#1F3A4D" }}>What the client ordered</span>
                      {!editingOrders && (
                        <button className="jt-btn" onClick={startEditOrders} style={{ background: "none", color: "#2E6B8F", fontSize: 12, padding: 0 }}>
                          {hasOrders ? "change" : "+ set quantities"}
                        </button>
                      )}
                    </div>
                    {editingOrders ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                          {PIECE_TYPES.map((t) => (
                            <div key={t}>
                              <label style={{ fontSize: 11, color: "#8A8578" }}>{t}</label>
                              <input className="jt-input" type="number" min="0" step="1" placeholder="0" value={orderDraft[t]} onChange={(e) => setOrderDraft((f) => ({ ...f, [t]: e.target.value }))} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="jt-btn" onClick={saveOrders} style={{ background: "#1F3A4D", color: "#fff", borderRadius: 6, padding: "7px 12px", fontSize: 12 }}>
                            Save
                          </button>
                          <button className="jt-btn" onClick={() => setEditingOrders(false)} style={{ background: "none", color: "#8A8578", fontSize: 12 }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : hasOrders ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {pieceProgress.map(({ type, made, ordered }) => {
                          if (ordered === 0) return null;
                          const done = made >= ordered;
                          return (
                            <span key={type} className="jt-chip" style={{ background: done ? "#DDEBDF" : "#F5E7C9", color: done ? "#2F5C3B" : "#8A5A12" }}>
                              {type}: {made}/{ordered}
                              {done ? " ✓" : ""}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#8A8578", marginTop: 6 }}>Set how many windows, doors, or screens the client asked for so you can track progress.</div>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "0.9fr 0.6fr 1.5fr auto", gap: 8, alignItems: "start" }}>
                    <select className="jt-input" value={pieceForm.type} onChange={(e) => setPieceForm((f) => ({ ...f, type: e.target.value }))}>
                      {PIECE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input className="jt-input" type="number" min="1" step="1" placeholder="Qty" value={pieceForm.qty} onChange={(e) => setPieceForm((f) => ({ ...f, qty: e.target.value }))} />
                    <input className="jt-input" placeholder="Size or note, e.g. 1.2m x 1.5m sliding" value={pieceForm.label} onChange={(e) => setPieceForm((f) => ({ ...f, label: e.target.value }))} />
                    <button className="jt-btn" onClick={addPiece} style={{ background: "#2E6B8F", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
                      Add
                    </button>
                  </div>
                  {pieceError && <div style={{ color: "#8A2E1E", fontSize: 13, marginTop: 8 }}>{pieceError}</div>}

                  <div style={{ marginTop: 16 }}>
                    {activePieces.length === 0 ? (
                      <div style={{ color: "#8A8578", fontSize: 14, padding: "20px 0", textAlign: "center" }}>No pieces logged yet. Add how many windows, doors, or screens you've made above.</div>
                    ) : (
                      activePieces.map((p) => (
                        <div key={p.id} className="jt-row">
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="jt-chip" style={{ background: PIECE_COLORS[p.type]?.bg || "#EAE5D6", color: PIECE_COLORS[p.type]?.text || "#6B6552" }}>
                                {p.type}
                              </span>
                              <span style={{ fontSize: 14 }}>{p.label || "—"}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "var(--jt-mono)", fontSize: 14 }}>× {p.qty}</span>
                            <button className="jt-del" onClick={() => removePiece(p.id)} aria-label={`Remove ${p.type} entry`}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---------------- INVENTORY VIEW ---------------- */}
      {view === "inventory" && (
        <div style={{ padding: "18px 20px" }}>
          <div style={{ fontFamily: "var(--jt-display)", fontWeight: 600, fontSize: 15, marginBottom: 12, color: "#1F3A4D" }}>Shop stock</div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr auto", gap: 8, alignItems: "start" }}>
            <input className="jt-input" placeholder="Item, e.g. 6063 aluminum profile" value={invForm.name} onChange={(e) => setInvForm((f) => ({ ...f, name: e.target.value }))} />
            <select className="jt-input" value={invForm.category} onChange={(e) => setInvForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className="jt-input" value={invForm.unit} onChange={(e) => setInvForm((f) => ({ ...f, unit: e.target.value }))}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input className="jt-input" type="number" min="0" step="0.01" placeholder="Qty" value={invForm.qty} onChange={(e) => setInvForm((f) => ({ ...f, qty: e.target.value }))} />
            <input className="jt-input" type="number" min="0" step="0.01" placeholder="Reorder at" value={invForm.reorderLevel} onChange={(e) => setInvForm((f) => ({ ...f, reorderLevel: e.target.value }))} />
            <input className="jt-input" type="number" min="0" step="0.01" placeholder="₱ per unit" value={invForm.costPerUnit} onChange={(e) => setInvForm((f) => ({ ...f, costPerUnit: e.target.value }))} />
            <button className="jt-btn" onClick={addInvItem} style={{ background: "#2E6B8F", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
              Add
            </button>
          </div>
          {invError && <div style={{ color: "#8A2E1E", fontSize: 13, marginTop: 8 }}>{invError}</div>}

          {lowStock.length > 0 && (
            <div style={{ background: "#F5DCD3", color: "#8A2E1E", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 16 }}>
              {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below reorder level: {lowStock.map((i) => i.name).join(", ")}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            {inventory.length === 0 ? (
              <div style={{ color: "#8A8578", fontSize: 14, padding: "20px 0", textAlign: "center" }}>No stock items yet. Add your aluminum profiles, glass sheets, hardware, or screen mesh above.</div>
            ) : (
              inventory.map((it) => {
                const low = it.qty <= it.reorderLevel;
                return (
                  <div key={it.id} className="jt-row">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="jt-chip" style={{ background: CAT_COLORS[it.category]?.bg || "#EAE5D6", color: CAT_COLORS[it.category]?.text || "#6B6552" }}>
                          {it.category}
                        </span>
                        <span style={{ fontSize: 14 }}>{it.name}</span>
                        {low && <span style={{ fontSize: 11, color: "#8A2E1E", fontWeight: 500 }}>low stock</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A8578", marginTop: 3 }}>
                        {fmtMoney(it.costPerUnit, "₱")}/{it.unit} · reorder at {it.reorderLevel} {it.unit}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button className="jt-btn" onClick={() => adjustInvQty(it.id, -1)} style={{ background: "#EAE5D6", color: "#26231C", borderRadius: 4, width: 26, height: 26, fontSize: 14 }}>
                        −
                      </button>
                      <span style={{ fontFamily: "var(--jt-mono)", fontSize: 14, minWidth: 50, textAlign: "center" }}>
                        {it.qty} {it.unit}
                      </span>
                      <button className="jt-btn" onClick={() => adjustInvQty(it.id, 1)} style={{ background: "#EAE5D6", color: "#26231C", borderRadius: 4, width: 26, height: 26, fontSize: 14 }}>
                        +
                      </button>
                      <button className="jt-del" onClick={() => removeInvItem(it.id)} aria-label={`Remove ${it.name}`}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <div style={{ padding: "10px 20px", background: "#F5DCD3", color: "#8A2E1E", fontSize: 13 }}>{error}</div>}
    </div>
  );
}
