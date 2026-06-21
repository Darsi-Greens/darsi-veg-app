import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

const PAY_COLOR = { cash: '#2d6a4f', upi: '#2196f3', credit: '#f4a261' };
const PAY_TE    = { cash: 'నగదు',    upi: 'UPI',     credit: 'అప్పు'  };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, sublabel, value, color, wide }) {
  return (
    <View style={[styles.statCard, wide && styles.statCardWide]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statSub}>{sublabel}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function TodaySummary() {
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [sales,       setSales]       = useState([]);
  const [vendorTotal, setVendorTotal] = useState(0);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const date = todayStr();
    try {
      const [salesSnap, ordersSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'),         where('sale_date',  '==', date))),
        getDocs(query(collection(db, 'vendor_orders'), where('order_date', '==', date))),
      ]);

      setSales(salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const buyTotal = ordersSnap.docs.reduce(
        (sum, d) => sum + (d.data().total_amount ?? 0), 0
      );
      setVendorTotal(buyTotal);
    } catch { /* offline — keep existing state */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  // ── Aggregations ──────────────────────────────────────────────────────────────
  const totalSales  = sales.reduce((s, t) => s + (t.total_amount ?? 0), 0);
  const grossProfit = totalSales - vendorTotal;
  const txCount     = sales.length;

  const payBreakdown = sales.reduce(
    (acc, s) => {
      const m = s.payment_mode ?? 'cash';
      acc[m] = (acc[m] ?? 0) + (s.total_amount ?? 0);
      return acc;
    },
    { cash: 0, upi: 0, credit: 0 }
  );

  // Per-vegetable revenue map → top seller
  const vegRev = {};
  sales.forEach((s) => {
    const key = s.veg_name_te ?? s.veg_name_en;
    vegRev[key] = (vegRev[key] ?? 0) + (s.total_amount ?? 0);
  });
  const topSeller = Object.entries(vegRev).sort((a, b) => b[1] - a[1])[0];

  // Sort newest first
  const sorted = [...sales].sort(
    (a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0)
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>నేటి సారాంశం</Text>
          <Text style={styles.headerSub}>Today's Summary — {todayStr()}</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#2d6a4f" />
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>నేటి సారాంశం</Text>
            <Text style={styles.headerSub}>Today's Summary — {todayStr()}</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); fetchData(); }}>
            <Text style={styles.refreshBtnText}>↻ రిఫ్రెష్</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2d6a4f']} />
        }
      >
        {/* ── Stats grid ── */}
        <View style={styles.statsGrid}>
          <StatCard
            label="మొత్తం అమ్మకాలు" sublabel="Total Sales"
            value={`₹${totalSales.toFixed(0)}`} color="#2d6a4f" wide
          />
          <StatCard
            label="లాభం" sublabel="Gross Profit"
            value={`₹${grossProfit.toFixed(0)}`}
            color={grossProfit >= 0 ? '#27ae60' : '#c0392b'} wide
          />
          <StatCard
            label="లావాదేవీలు" sublabel="Transactions"
            value={String(txCount)} color="#1a472a"
          />
          <StatCard
            label="కొనుగోలు" sublabel="Stock Cost"
            value={`₹${vendorTotal.toFixed(0)}`} color="#555"
          />
        </View>

        {/* ── Top seller ── */}
        {topSeller && (
          <View style={styles.topCard}>
            <Text style={styles.topCardLabel}>⭐ నేటి అగ్ర విక్రయం / Top Seller</Text>
            <View style={styles.topCardRow}>
              <Text style={styles.topSellerName}>{topSeller[0]}</Text>
              <Text style={styles.topSellerRev}>₹{topSeller[1].toFixed(0)}</Text>
            </View>
          </View>
        )}

        {/* ── Payment breakdown ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>చెల్లింపు వివరాలు / Payment Breakdown</Text>
          {(['cash', 'upi', 'credit'] ).map((mode) => {
            const amt = payBreakdown[mode] ?? 0;
            const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
            return (
              <View key={mode} style={styles.payRow}>
                <View style={[styles.payDot, { backgroundColor: PAY_COLOR[mode] }]} />
                <Text style={styles.payLabel}>{PAY_TE[mode]}</Text>
                <View style={styles.payBarTrack}>
                  <View style={[styles.payBar, { backgroundColor: PAY_COLOR[mode], width: `${pct}%` }]} />
                </View>
                <Text style={styles.payAmt}>₹{amt.toFixed(0)}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Transactions list ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>అమ్మకాల వివరాలు / Transactions ({txCount})</Text>

          {sorted.length === 0 ? (
            <Text style={styles.emptyTx}>
              ఈ రోజు ఇంకా అమ్మకాలు లేవు.{'\n'}No sales recorded today yet.
            </Text>
          ) : (
            sorted.map((sale, idx) => (
              <View key={sale.id} style={[styles.txRow, idx > 0 && styles.txBorder]}>
                <Text style={styles.txEmoji}>{sale.veg_emoji || '🥬'}</Text>
                <View style={styles.txInfo}>
                  <Text style={styles.txNameTe}>{sale.veg_name_te}</Text>
                  <Text style={styles.txDetail}>
                    {sale.quantity} {sale.unit} × ₹{sale.sell_price}
                  </Text>
                  {sale.created_at ? (
                    <Text style={styles.txTime}>{fmtTime(sale.created_at)}</Text>
                  ) : null}
                </View>
                <View style={styles.txRight}>
                  <Text style={styles.txAmount}>₹{(sale.total_amount ?? 0).toFixed(0)}</Text>
                  <Text style={[styles.txMode, { color: PAY_COLOR[sale.payment_mode] ?? '#555' }]}>
                    {PAY_TE[sale.payment_mode] ?? sale.payment_mode}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f7f0' },

  header: { backgroundColor: '#1a472a', paddingVertical: 16, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  headerSub:   { fontSize: 13, color: '#a8d5b5', marginTop: 2 },
  refreshBtn:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  refreshBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  scrollContent: { padding: 16, paddingBottom: 48 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  statCardWide: { width: '47%' },
  statValue:    { fontSize: 26, fontWeight: 'bold' },
  statLabel:    { fontSize: 14, color: '#333', fontWeight: '600', marginTop: 4 },
  statSub:      { fontSize: 11, color: '#888', marginTop: 2 },

  // Top seller
  topCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#f4a261',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  topCardLabel:    { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  topCardRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  topSellerName:   { fontSize: 20, fontWeight: '700', color: '#1a472a' },
  topSellerRev:    { fontSize: 22, fontWeight: 'bold', color: '#f4a261' },

  // Section card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a472a', marginBottom: 14 },

  // Payment breakdown
  payRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  payDot:     { width: 10, height: 10, borderRadius: 5 },
  payLabel:   { width: 48, fontSize: 13, fontWeight: '600', color: '#444' },
  payBarTrack: { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  payBar:     { height: '100%', borderRadius: 4 },
  payAmt:     { width: 56, fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'right' },

  // Transactions
  emptyTx: { textAlign: 'center', color: '#888', fontSize: 14, lineHeight: 24, paddingVertical: 16 },
  txRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  txBorder: { borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  txEmoji:  { fontSize: 28 },
  txInfo:   { flex: 1 },
  txNameTe: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  txDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  txTime:   { fontSize: 11, color: '#aaa', marginTop: 2 },
  txRight:  { alignItems: 'flex-end' },
  txAmount: { fontSize: 17, fontWeight: 'bold', color: '#1a472a' },
  txMode:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
