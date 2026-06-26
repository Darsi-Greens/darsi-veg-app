import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, Alert, Modal, TextInput, ActivityIndicator,
  Platform, RefreshControl, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  collection, updateDoc, setDoc, getDocs, getDoc, doc,
  serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LocalDB }  from '../services/LocalDB';
import { SyncQueue } from '../services/SyncQueue';
import { newId } from '../services/ids';
import { inr } from '../utils/money';
import { Voice } from '../services/Speak';
import SyncIndicator from '../components/SyncIndicator';
import AppHeader from '../components/AppHeader';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('te-IN', { hour: '2-digit', minute: '2-digit' });
}

const EXPENSE_TYPES = ['⛽ ఇంధనం', '🛍 సంచులు', '👷 కూలి', '📦 రవాణా', '🔧 ఇతర'];

export default function AnalyticsScreen() {
  const [activeTab,  setActiveTab]  = useState('today'); // today | month | credit
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Today state
  const [todayData,      setTodayData]      = useState(null);
  const [customerCount,  setCustomerCount]  = useState(0);
  const [expenseModal,   setExpenseModal]   = useState(false);
  const [expType,        setExpType]        = useState(EXPENSE_TYPES[0]);
  const [expAmount,      setExpAmount]      = useState('');
  const [expNote,        setExpNote]        = useState('');
  const [savingExp,      setSavingExp]      = useState(false);
  const [expenses,       setExpenses]       = useState([]);

  // Month state
  const [monthData,   setMonthData]   = useState(null);

  // Credit state
  const [creditSales, setCreditSales] = useState([]);
  const [markingPaid, setMarkingPaid] = useState(null);

  // Vendor dues state
  const [vendorDues,  setVendorDues]  = useState([]);

  // Load today's customer count so adjustCount edits the real running total
  // instead of resetting it to 0 (which would clobber the day's count). Only
  // called on first load — focus reloads must not overwrite optimistic taps.
  const loadCustomerCount = useCallback(async () => {
    const today = todayStr();
    try {
      const sumSnap = await getDoc(doc(db, 'daily_summary', today));
      const count = sumSnap.exists() ? (sumSnap.data().customer_count || 0) : 0;
      setCustomerCount(count);
      await LocalDB.set(`customer_count_${today}`, count);
    } catch {
      const cached = await LocalDB.get(`customer_count_${today}`);
      if (cached != null) setCustomerCount(cached);
    }
  }, []);

  const loadToday = useCallback(async () => {
    const today = todayStr();
    try {
      const [salesSnap, ordSnap, expSnap, stockSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'),          where('sale_date',   '==', today))),
        getDocs(query(collection(db, 'vendor_orders'),  where('order_date',  '==', today), where('status', '==', 'received'))),
        getDocs(query(collection(db, 'daily_expenses'), where('expense_date','==', today))),
        getDocs(query(collection(db, 'stock_log'),      where('log_date',    '==', today), where('type', '==', 'wastage'))),
      ]);

      // Aggregate sales
      let totalSales = 0, totalTxns = 0;
      const vegMap     = {}; // veg_id → { name_te, emoji, qty, revenue }
      const payBreak   = { cash: 0, upi: 0, credit: 0 };
      salesSnap.docs.forEach((d) => {
        const s = d.data();
        totalSales += s.total_amount || 0;
        totalTxns++;
        const pm = s.payment_mode || 'cash';
        payBreak[pm] = (payBreak[pm] || 0) + (s.total_amount || 0);
        const id = s.veg_id || s.veg_name_en;
        if (id) {
          vegMap[id] = vegMap[id] || { name_te: s.veg_name_te, emoji: s.veg_emoji ?? '🥬', qty: 0, revenue: 0, sell_price: s.sell_price || 0, buy_price: 0 };
          vegMap[id].qty     += s.quantity || 0;
          vegMap[id].revenue += s.total_amount || 0;
        }
      });

      // Buy prices from orders. totalBuyCost = what was PURCHASED today (cash out),
      // kept for context — but profit is computed on cost of goods SOLD (COGS),
      // not the whole purchase, so a big morning order doesn't make the day look
      // unprofitable. Leftover stock keeps its value and carries to tomorrow.
      let totalBuyCost = 0;
      const buyPriceMap = {}; // veg_id → buy_price (covers wasted-but-unsold veg too)
      ordSnap.docs.forEach((d) => {
        const o = d.data();
        totalBuyCost += o.total_amount || 0;
        (o.items || []).forEach((item) => {
          const id = item.veg_id;
          if (id) {
            buyPriceMap[id] = item.buy_price || 0;
            if (vegMap[id]) vegMap[id].buy_price = item.buy_price || 0;
          }
        });
      });

      // Cost of goods SOLD = Σ (sold qty × buy price)
      const cogs = Object.values(vegMap).reduce((sum, v) => sum + (v.buy_price || 0) * (v.qty || 0), 0);

      // Expenses
      const expList = expSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const totalExpenses = expList.reduce((s, e) => s + (e.amount || 0), 0);
      setExpenses(expList);

      // Wastage cost (use the order buy-price map so wasted-but-unsold veg count)
      let wasteCost = 0;
      stockSnap.docs.forEach((d) => {
        const w = d.data();
        const bp = buyPriceMap[w.veg_id] ?? vegMap[w.veg_id]?.buy_price ?? 0;
        wasteCost += bp * (w.quantity || 0);
      });

      const grossProfit = totalSales - cogs;
      const netProfit   = grossProfit - totalExpenses - wasteCost;

      // Top sellers
      const topVegs = Object.entries(vegMap)
        .map(([id, v]) => ({ id, ...v, profit: v.revenue - (v.buy_price * v.qty) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setTodayData({ totalSales, totalTxns, totalBuyCost, cogs, totalExpenses, wasteCost, grossProfit, netProfit, payBreak, topVegs, vegMap });
    } catch (e) {
      console.warn('Analytics today load error:', e);
    }
  }, []);

  const loadMonth = useCallback(async () => {
    const prefix = monthPrefix();
    try {
      const [salesSnap, ordSnap, expSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'),          where('sale_date',    '>=', `${prefix}-01`), where('sale_date', '<=', `${prefix}-31`))),
        getDocs(query(collection(db, 'vendor_orders'),  where('order_date',   '>=', `${prefix}-01`), where('order_date', '<=', `${prefix}-31`))),
        getDocs(query(collection(db, 'daily_expenses'), where('expense_date', '>=', `${prefix}-01`), where('expense_date', '<=', `${prefix}-31`))),
      ]);

      // Per-day revenue
      const dayMap     = {}; // date → { sales, cost, expenses }
      const vegQtyMap  = {}; // veg_id → { name_te, emoji, qty }
      const vendorMap  = {}; // vendor_id → { name, totalOrders, totalSpend }

      salesSnap.docs.forEach((d) => {
        const s = d.data();
        dayMap[s.sale_date] = dayMap[s.sale_date] || { sales: 0, cost: 0, expenses: 0 };
        dayMap[s.sale_date].sales += s.total_amount || 0;
        const id = s.veg_id || s.veg_name_en;
        if (id) {
          vegQtyMap[id] = vegQtyMap[id] || { name_te: s.veg_name_te, emoji: s.veg_emoji ?? '🥬', qty: 0 };
          vegQtyMap[id].qty += s.quantity || 0;
        }
      });

      ordSnap.docs.forEach((d) => {
        const o = d.data();
        if (o.status !== 'received') return; // filter client-side — avoids composite index
        dayMap[o.order_date] = dayMap[o.order_date] || { sales: 0, cost: 0, expenses: 0 };
        dayMap[o.order_date].cost += o.total_amount || 0;
        const vid = o.vendor_id || o.vendor_name;
        if (vid) {
          vendorMap[vid] = vendorMap[vid] || { name: o.vendor_name, totalOrders: 0, totalSpend: 0, totalQty: 0 };
          vendorMap[vid].totalOrders++;
          vendorMap[vid].totalSpend += o.total_amount || 0;
          (o.items || []).forEach((item) => { vendorMap[vid].totalQty += item.quantity || 0; });
        }
      });

      expSnap.docs.forEach((d) => {
        const e = d.data();
        dayMap[e.expense_date] = dayMap[e.expense_date] || { sales: 0, cost: 0, expenses: 0 };
        dayMap[e.expense_date].expenses += e.amount || 0;
      });

      const days = Object.entries(dayMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, v]) => ({ date, ...v, profit: v.sales - v.cost - v.expenses }));

      const monthTotals = days.reduce((acc, d) => ({
        sales: acc.sales + d.sales,
        cost:  acc.cost  + d.cost,
        exp:   acc.exp   + d.expenses,
        profit: acc.profit + d.profit,
      }), { sales: 0, cost: 0, exp: 0, profit: 0 });

      const topVegs = Object.values(vegQtyMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
      const vendors = Object.values(vendorMap)
        .map((v) => ({ ...v, avgPerKg: v.totalQty > 0 ? v.totalSpend / v.totalQty : 0 }))
        .sort((a, b) => a.avgPerKg - b.avgPerKg);

      setMonthData({ days, monthTotals, topVegs, vendors });
    } catch (e) {
      console.warn('Analytics month load error:', e);
    }
  }, []);

  const loadVendorDues = useCallback(async () => {
    try {
      // Fetch all vendor_orders — filter client-side to avoid composite index
      const snap = await getDocs(collection(db, 'vendor_orders'));
      const dueMap = {};
      snap.docs.forEach((d) => {
        const o = d.data();
        if (o.payment_status === 'paid') return;
        const vid = o.vendor_id || o.vendor_name;
        if (!vid) return;
        dueMap[vid] = dueMap[vid] || {
          name:    o.vendor_name,
          name_en: o.vendor_name_en || o.vendor_name,
          orderCount:    0,
          totalPending:  0,
        };
        dueMap[vid].orderCount++;
        dueMap[vid].totalPending += o.total_amount || 0;
      });
      const list = Object.values(dueMap).sort((a, b) => b.totalPending - a.totalPending);
      setVendorDues(list);
    } catch (e) {
      console.warn('Vendor dues load error:', e);
    }
  }, []);

  const loadCredit = useCallback(async () => {
    try {
      // No orderBy — avoids requiring a composite Firestore index; sort client-side
      const snap = await getDocs(query(
        collection(db, 'sales'),
        where('payment_mode', '==', 'credit'),
      ));
      const unpaid = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => !s.credit_paid)
        .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));
      setCreditSales(unpaid);
    } catch (e) {
      console.warn('Credit load error:', e);
    }
  }, []);

  const firstLoad = useRef(true);

  const loadAll = useCallback(async () => {
    const tasks = [loadToday(), loadMonth(), loadCredit(), loadVendorDues()];
    // Counter is user-driven/optimistic — only sync it from the server on the
    // very first load, never on focus reloads (would clobber pending taps).
    if (firstLoad.current) tasks.push(loadCustomerCount());
    await Promise.all(tasks);
    firstLoad.current = false;
    setLoading(false);
    setRefreshing(false);
  }, [loadToday, loadMonth, loadCredit, loadVendorDues, loadCustomerCount]);

  // Reload whenever the tab regains focus so figures stay fresh across tabs.
  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  // ── Customer count ───────────────────────────────────────────────────────────

  const adjustCount = async (delta) => {
    const today = todayStr();
    const newCount = Math.max(0, customerCount + delta);
    setCustomerCount(newCount);
    Voice.speak(`${newCount} కస్టమర్లు`);
    // Persist locally first so the count survives an app restart while offline.
    await LocalDB.set(`customer_count_${today}`, newCount);

    const payload = { summary_date: today, customer_count: newCount };
    try {
      // setDoc with the date as ID updates (not appends) the day's summary.
      await setDoc(doc(db, 'daily_summary', today), {
        ...payload,
        updated_at: serverTimestamp(),
      }, { merge: true });
    } catch {
      // Offline — queue so the count isn't lost (was silently dropped before).
      await SyncQueue.add({
        type: 'setDoc',
        path: ['daily_summary', today],
        data: payload,
        merge: true,
      });
    }
  };

  // ── Save expense ─────────────────────────────────────────────────────────────

  const saveExpense = async () => {
    const amt = parseFloat(expAmount);
    if (!amt || amt <= 0) { Alert.alert('మొత్తం చేర్చండి'); return; }
    setSavingExp(true);

    const expData = {
      expense_date: todayStr(),
      type:         expType,
      amount:       amt,
      note:         expNote,
    };

    // 1. Save locally + update UI immediately (client ID = idempotent write)
    const expId = newId();
    await LocalDB.append('today_expenses', { ...expData, id: expId, saved_at: new Date().toISOString() });
    const newExp = { id: expId, ...expData };
    setExpenses((p) => [...p, newExp]);
    setTodayData((p) => p ? { ...p, totalExpenses: p.totalExpenses + amt, netProfit: p.netProfit - amt } : p);
    setExpenseModal(false);
    setExpAmount('');
    setExpNote('');
    setSavingExp(false);
    Voice.speak(`ఖర్చు ${Voice.money(amt)} నమోదు అయింది`);

    // 2. Sync to Firestore in background (idempotent — no duplicate on retry)
    try {
      await setDoc(doc(db, 'daily_expenses', expId), { ...expData, created_at: serverTimestamp() });
    } catch {
      await SyncQueue.add({ type: 'createWithId', collectionName: 'daily_expenses', docId: expId, data: expData });
    }
  };

  // ── Mark credit paid ─────────────────────────────────────────────────────────

  const markPaid = async (sale) => {
    setMarkingPaid(sale.id);
    try {
      await updateDoc(doc(db, 'sales', sale.id), {
        credit_paid:    true,
        credit_paid_at: serverTimestamp(),
      });
      setCreditSales((p) => p.filter((s) => s.id !== sale.id));
      Voice.speak(`బాకీ అందింది, ${Voice.money(sale.total_amount || 0)}`);
    } catch {
      Alert.alert('లోపం', 'అప్‌డేట్ విఫలమైంది.');
    } finally {
      setMarkingPaid(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="నివేదిక" subtitle="Analytics" />
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  const td = todayData;
  const creditTotal = creditSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
  const totalDues   = vendorDues.reduce((sum, v) => sum + v.totalPending, 0);

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="నివేదిక" subtitle="Analytics" />

      {/* Tab bar */}
      <View style={s.tabs}>
        {[
          { key: 'today',  label: 'ఈరోజు' },
          { key: 'month',  label: 'నెల' },
          { key: 'credit', label: `క్రెడిట్${creditSales.length > 0 ? ` (${creditSales.length})` : ''}` },
          { key: 'dues',   label: `వెండర్ బాకీ${totalDues > 0 ? ' 🔴' : ''}` },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => {
              setActiveTab(t.key);
              Voice.speak({ today: 'ఈరోజు', month: 'నెల', credit: 'క్రెడిట్', dues: 'వెండర్ బాకీ' }[t.key] || '');
            }}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2d6a4f" />}>

        {/* ═══════════════ TODAY TAB ═══════════════ */}
        {activeTab === 'today' && (
          <>
            {/* Customer counter */}
            <View style={s.card}>
              <Text style={s.cardLabel}>ఈరోజు వచ్చిన కస్టమర్లు / Customers Today</Text>
              <View style={s.counterRow}>
                <TouchableOpacity style={s.countBtn} onPress={() => adjustCount(-1)}>
                  <Text style={s.countBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.counterNum}>{customerCount}</Text>
                <TouchableOpacity style={s.countBtn} onPress={() => adjustCount(1)}>
                  <Text style={s.countBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Profit card */}
            <View style={[s.card, { backgroundColor: (td?.netProfit ?? 0) >= 0 ? '#f0fff4' : '#fff5f5' }]}>
              <Text style={s.cardLabel}>లాభం / Net Profit</Text>
              <Text style={[s.bigNum, { color: (td?.netProfit ?? 0) >= 0 ? '#1a472a' : '#e74c3c' }]}>
                {inr(td?.netProfit ?? 0)}
              </Text>
              <View style={s.profitBreak}>
                <ProfitRow label="అమ్మకాలు"          val={td?.totalSales}    color="#2d6a4f" plus />
                <ProfitRow label="అమ్మిన సరుకు ఖర్చు" val={td?.cogs}          color="#e74c3c" />
                <ProfitRow label="ఖర్చులు"           val={td?.totalExpenses} color="#f6a623" />
                <ProfitRow label="వేస్ట్"            val={td?.wasteCost}     color="#999" />
              </View>
              <Text style={s.profitNote}>
                నేటి కొనుగోలు · Bought today: {inr(td?.totalBuyCost ?? 0)}  ·  మిగిలిన సరుకు రేపటికి
              </Text>
            </View>

            {/* Payment breakdown */}
            <View style={s.card}>
              <Text style={s.cardLabel}>చెల్లింపు / Payment Mode</Text>
              <View style={s.payRow}>
                <PayCell label="నగదు"  val={td?.payBreak?.cash}   color="#2d6a4f" />
                <PayCell label="UPI"   val={td?.payBreak?.upi}    color="#5b8dee" />
                <PayCell label="క్రెడిట్" val={td?.payBreak?.credit} color="#e74c3c" />
              </View>
              <Text style={s.txnCount}>{td?.totalTxns ?? 0} transactions</Text>
            </View>

            {/* Expenses section */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <Text style={s.cardLabel}>ఖర్చులు / Expenses</Text>
                <TouchableOpacity style={s.addExpBtn} onPress={() => setExpenseModal(true)}>
                  <Text style={s.addExpBtnText}>+ చేర్చు</Text>
                </TouchableOpacity>
              </View>
              {expenses.length === 0 ? (
                <Text style={s.emptyHint}>ఇంకా ఖర్చులు నమోదు చేయలేదు</Text>
              ) : (
                expenses.map((e) => (
                  <View key={e.id} style={s.expRow}>
                    <Text style={s.expType}>{e.type}</Text>
                    <Text style={s.expNote}>{e.note}</Text>
                    <Text style={s.expAmt}>{inr(e.amount || 0)}</Text>
                  </View>
                ))
              )}
              {expenses.length > 0 && (
                <Text style={s.expTotal}>మొత్తం: {inr(td?.totalExpenses ?? 0)}</Text>
              )}
            </View>

            {/* Top sellers */}
            {(td?.topVegs?.length ?? 0) > 0 && (
              <View style={s.card}>
                <Text style={s.cardLabel}>టాప్ అమ్మకాలు / Top Sales</Text>
                {td.topVegs.map((v) => (
                  <View key={v.id} style={s.vegRow}>
                    <Text style={s.vegEmoji}>{v.emoji}</Text>
                    <Text style={s.vegName}>{v.name_te}</Text>
                    <Text style={s.vegQty}>{v.qty.toFixed(1)} {v.unit ?? 'kg'}</Text>
                    <Text style={s.vegRev}>{inr(v.revenue)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ═══════════════ MONTH TAB ═══════════════ */}
        {activeTab === 'month' && monthData && (
          <>
            {/* Month totals */}
            <View style={s.card}>
              <Text style={s.cardLabel}>నెల మొత్తం / {monthPrefix()}</Text>
              <View style={s.monthTotals}>
                <MonthCell label="అమ్మకాలు"  val={monthData.monthTotals.sales}  color="#2d6a4f" />
                <MonthCell label="కొనుగోలు"  val={monthData.monthTotals.cost}   color="#e74c3c" />
                <MonthCell label="ఖర్చులు"   val={monthData.monthTotals.exp}    color="#f6a623" />
                <MonthCell label="లాభం"      val={monthData.monthTotals.profit} color={monthData.monthTotals.profit >= 0 ? '#1a472a' : '#e74c3c'} bold />
              </View>
            </View>

            {/* Per-day list */}
            <View style={s.card}>
              <Text style={s.cardLabel}>రోజువారీ / Per Day</Text>
              {monthData.days.map((d) => (
                <View key={d.date} style={s.dayRow}>
                  <Text style={s.dayDate}>{fmtDate(d.date)}</Text>
                  <Text style={s.daySales}>{inr(d.sales)}</Text>
                  <Text style={[s.dayProfit, { color: d.profit >= 0 ? '#2d6a4f' : '#e74c3c' }]}>
                    {d.profit >= 0 ? '+' : ''}{inr(d.profit)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Top vegetables this month */}
            {monthData.topVegs.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardLabel}>టాప్ కూరగాయలు (నెల) / Top Veg Month</Text>
                {monthData.topVegs.map((v, i) => (
                  <View key={i} style={s.vegRow}>
                    <Text style={s.vegEmoji}>{v.emoji}</Text>
                    <Text style={s.vegName}>{v.name_te}</Text>
                    <Text style={s.vegRev}>{v.qty.toFixed(1)} kg</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Best vendor */}
            {monthData.vendors.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardLabel}>వెండర్ విశ్లేషణ / Vendor Analysis</Text>
                {monthData.vendors.map((v, i) => (
                  <View key={i} style={s.vendorRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.vendorName}>{v.name}</Text>
                      <Text style={s.vendorDetail}>{v.totalOrders} orders · {v.totalQty.toFixed(0)} kg total</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.vendorAvg}>{inr(v.avgPerKg, 1)}/kg</Text>
                      <Text style={s.vendorTotal}>{inr(v.totalSpend)} total</Text>
                    </View>
                  </View>
                ))}
                <Text style={s.vendorHint}>↑ తక్కువ avg/kg = మంచి ధర వెండర్</Text>
              </View>
            )}
          </>
        )}

        {/* ═══════════════ CREDIT TAB ═══════════════ */}
        {activeTab === 'credit' && (
          <>
            <View style={[s.card, { backgroundColor: creditTotal > 0 ? '#fff5f5' : '#f0fff4' }]}>
              <Text style={s.cardLabel}>మొత్తం బాకీ / Total Udhari</Text>
              <Text style={[s.bigNum, { color: creditTotal > 0 ? '#e74c3c' : '#2d6a4f' }]}>
                {inr(creditTotal)}
              </Text>
              <Text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{creditSales.length} అవుట్‌స్టాండింగ్ సేల్స్</Text>
            </View>

            {creditSales.length === 0 ? (
              <View style={s.card}>
                <Text style={{ textAlign: 'center', color: '#2d6a4f', fontSize: 16, paddingVertical: 20 }}>
                  🎉 బాకీలు లేవు! All credits cleared.
                </Text>
              </View>
            ) : (
              creditSales.map((sale) => (
                <View key={sale.id} style={s.creditCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.creditVeg}>{sale.veg_emoji ?? '🥬'} {sale.veg_name_te}</Text>
                    <Text style={s.creditMeta}>
                      {sale.sale_date}  ·  {sale.quantity} {sale.unit}  ·  {inr(sale.sell_price)}/unit
                    </Text>
                    {sale.created_at ? <Text style={s.creditTime}>{fmtTime(sale.created_at)}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={s.creditAmt}>{inr(sale.total_amount || 0)}</Text>
                    <TouchableOpacity
                      style={[s.paidBtn, markingPaid === sale.id && { backgroundColor: '#74c69d' }]}
                      onPress={() => markPaid(sale)}
                      disabled={!!markingPaid}
                    >
                      {markingPaid === sale.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.paidBtnText}>✓ అందింది</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}
        {/* ═══════════════ VENDOR DUES TAB ═══════════════ */}
        {activeTab === 'dues' && (
          <>
            {/* Total outstanding card */}
            <View style={[s.card, { backgroundColor: totalDues > 0 ? '#fff5f5' : '#f0fff4' }]}>
              <Text style={s.cardLabel}>చెల్లించాల్సిన మొత్తం · Total Outstanding</Text>
              <Text style={[s.bigNum, { color: totalDues > 0 ? '#e74c3c' : '#2d6a4f' }]}>
                {inr(totalDues)}
              </Text>
              <Text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                {vendorDues.length} వెండర్లు · vendors with pending dues
              </Text>
            </View>

            {vendorDues.length === 0 ? (
              <View style={s.card}>
                <Text style={{ textAlign: 'center', color: '#2d6a4f', fontSize: 16, paddingVertical: 20 }}>
                  🎉 వెండర్ బాకీలు లేవు!{'\n'}All vendor dues cleared.
                </Text>
              </View>
            ) : (
              vendorDues.map((v, i) => (
                <View key={i} style={s.dueCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.dueVendorNameEn}>{v.name_en || v.name}</Text>
                    {v.name_en && v.name !== v.name_en ? (
                      <Text style={s.dueVendorNameTe}>{v.name}</Text>
                    ) : null}
                    <Text style={s.dueMeta}>
                      {v.orderCount} orders · {inr(v.totalPending)} pending
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={s.dueAmt}>{inr(v.totalPending)}</Text>
                    <View style={s.duePendingBadge}>
                      <Text style={s.duePendingText}>🔴 బాకీ</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        )}

      </ScrollView>

      {/* ── Expense modal ── */}
      <Modal visible={expenseModal} transparent animationType="slide" onRequestClose={() => setExpenseModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>+ ఖర్చు నమోదు</Text>
            <Text style={s.modalLabel}>రకం / Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EXPENSE_TYPES.map((t) => (
                  <TouchableOpacity key={t} style={[s.expTypeBtn, expType === t && s.expTypeBtnActive]} onPress={() => setExpType(t)}>
                    <Text style={[s.expTypeBtnText, expType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.modalLabel}>మొత్తం ₹</Text>
            <TextInput
              style={s.modalInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#aaa"
              value={expAmount}
              onChangeText={(v) => /^\d*\.?\d*$/.test(v) && setExpAmount(v)}
            />
            <Text style={s.modalLabel}>గమనిక (ఐచ్ఛికం)</Text>
            <TextInput
              style={[s.modalInput, { fontSize: 14 }]}
              placeholder="e.g. 2 లీటర్ పెట్రోల్"
              placeholderTextColor="#aaa"
              value={expNote}
              onChangeText={setExpNote}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setExpenseModal(false)}>
                <Text style={s.modalCancelText}>రద్దు</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalConfirm, savingExp && { backgroundColor: '#74c69d' }]} onPress={saveExpense} disabled={savingExp}>
                <Text style={s.modalConfirmText}>{savingExp ? 'నమోదు...' : '✓ సేవ్'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Small helper components ──────────────────────────────────────────────────

const ProfitRow = ({ label, val, color, plus }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
    <Text style={{ fontSize: 13, color: '#666' }}>{label}</Text>
    <Text style={{ fontSize: 13, fontWeight: '600', color }}>
      {plus ? '+' : '−'} {inr(val ?? 0, 2)}
    </Text>
  </View>
);

const PayCell = ({ label, val, color }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={{ fontSize: 16, fontWeight: '700', color }}>{inr(val ?? 0)}</Text>
    <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</Text>
  </View>
);

const MonthCell = ({ label, val, color, bold }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={{ fontSize: bold ? 18 : 15, fontWeight: bold ? 'bold' : '600', color }}>{inr(val ?? 0)}</Text>
    <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</Text>
  </View>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f7f0' },
  header:    { backgroundColor: '#1a472a', paddingVertical: 16, paddingHorizontal: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 13, color: '#a8d5b5', marginTop: 2 },

  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0f0e8' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#2d6a4f' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#1a472a' },

  scroll: { padding: 14, gap: 14, paddingBottom: 60 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  cardLabel:    { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bigNum:       { fontSize: 36, fontWeight: 'bold', marginBottom: 12 },
  emptyHint:    { color: '#888', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  // Customer counter
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  countBtn:   { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e8f5ec', alignItems: 'center', justifyContent: 'center' },
  countBtnText: { fontSize: 28, fontWeight: '300', color: '#2d6a4f', lineHeight: 32 },
  counterNum: { fontSize: 48, fontWeight: 'bold', color: '#1a472a', minWidth: 60, textAlign: 'center' },

  // Profit breakdown
  profitBreak: { gap: 2 },
  profitNote:  { fontSize: 11, color: '#888', marginTop: 10, fontStyle: 'italic' },

  // Payment
  payRow:   { flexDirection: 'row', paddingVertical: 8 },
  txnCount: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 8 },

  // Expenses
  addExpBtn:     { backgroundColor: '#e8f5ec', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addExpBtnText: { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },
  expRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 8 },
  expType:  { fontSize: 13, fontWeight: '600', color: '#1a472a', flex: 1 },
  expNote:  { fontSize: 12, color: '#888', flex: 1 },
  expAmt:   { fontSize: 15, fontWeight: '700', color: '#e74c3c' },
  expTotal: { fontSize: 14, fontWeight: '700', color: '#e74c3c', textAlign: 'right', marginTop: 10 },

  // Top sellers
  vegRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 8 },
  vegEmoji: { fontSize: 22 },
  vegName:  { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a472a' },
  vegQty:   { fontSize: 13, color: '#555' },
  vegRev:   { fontSize: 15, fontWeight: '700', color: '#2d6a4f' },

  // Month
  monthTotals: { flexDirection: 'row', paddingVertical: 8 },
  dayRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  dayDate:  { fontSize: 14, fontWeight: '600', color: '#555', width: 40 },
  daySales: { flex: 1, fontSize: 14, color: '#1a472a', textAlign: 'right' },
  dayProfit: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },

  // Vendor
  vendorRow:   { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', flexDirection: 'row' },
  vendorName:  { fontSize: 15, fontWeight: '700', color: '#1a472a' },
  vendorDetail: { fontSize: 12, color: '#888', marginTop: 2 },
  vendorAvg:   { fontSize: 15, fontWeight: '700', color: '#2d6a4f' },
  vendorTotal: { fontSize: 12, color: '#888', marginTop: 2 },
  vendorHint:  { fontSize: 11, color: '#888', marginTop: 10, textAlign: 'center' },

  // Credit
  creditCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderLeftWidth: 4, borderLeftColor: '#e74c3c',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  creditVeg:  { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  creditMeta: { fontSize: 12, color: '#666', marginTop: 3 },
  creditTime: { fontSize: 11, color: '#888', marginTop: 2 },
  creditAmt:  { fontSize: 20, fontWeight: 'bold', color: '#e74c3c' },
  paidBtn:    { backgroundColor: '#2d6a4f', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  paidBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Vendor dues
  dueCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderLeftWidth: 4, borderLeftColor: '#e74c3c',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  dueVendorNameEn: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  dueVendorNameTe: { fontSize: 13, color: '#666', marginTop: 1 },
  dueMeta:         { fontSize: 12, color: '#888', marginTop: 4 },
  dueAmt:          { fontSize: 20, fontWeight: 'bold', color: '#e74c3c' },
  duePendingBadge: { backgroundColor: '#fff3cd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  duePendingText:  { fontSize: 11, fontWeight: '700', color: '#856404' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 4 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4 },
  modalInput: {
    borderWidth: 1.5, borderColor: '#b7e4c7', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 18, color: '#1a1a1a', fontWeight: '600',
  },
  expTypeBtn:       { backgroundColor: '#f0f7f0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  expTypeBtnActive: { backgroundColor: '#2d6a4f' },
  expTypeBtnText:   { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  modalBtns:        { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel:      { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  modalCancelText:  { fontSize: 15, fontWeight: '600', color: '#555' },
  modalConfirm:     { flex: 1, backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
