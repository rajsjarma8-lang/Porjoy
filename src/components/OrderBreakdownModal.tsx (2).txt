import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  X,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
} from 'lucide-react';
import { AdminOrder } from '../types/wallet';
import { calculateCommission, formatINR } from '../utils/formatters';
import { useLanguage } from '../i18n/LanguageContext';

export const PENDING_GATEWAY_ORDER_KEY = 'vaultpay_pending_gw_order';

export interface PendingGatewayOrder {
  orderId: string;
  orderCode: string;
  amount: number;
  merchantOrderNo: string;
  gatewayOrderNo?: string;
  cashierUrl: string;
}

interface GatewaySession {
  merchantOrderNo: string;
  gatewayOrderNo: string;
  cashierUrl: string;
  amount?: string;
}

interface OrderBreakdownModalProps {
  order: AdminOrder | null;
  isStandalone?: boolean;
  userInfo?: {
    userId?: string;
    username?: string;
    mobileNumber?: string;
  };
  onClose: () => void;
  onSubmitPayment: (
    orderId: string,
    amount: number,
    utrReference?: string
  ) => {
    ok: boolean;
    error?: string;
    paidAmount?: number;
    cashback?: number;
    totalPayout?: number;
  };
}

export const OrderBreakdownModal: React.FC<OrderBreakdownModalProps> = ({
  order,
  isStandalone = false,
  userInfo,
  onClose,
  onSubmitPayment,
}) => {
  const { t } = useLanguage();
  const [step, setStep] = useState<'pay_link' | 'inline_gateway' | 'enter_utr' | 'pending'>('pay_link');
  const [utrRef, setUtrRef] = useState('');
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    paidAmount: number;
    totalPayout: number;
    utr: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // BladePay / SilkPay Gateway session state
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewaySession, setGatewaySession] = useState<GatewaySession | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [submittingUtr, setSubmittingUtr] = useState(false);

  const persistPendingGatewayOrder = useCallback(
    (targetOrder: AdminOrder, session: GatewaySession) => {
      try {
        const payload: PendingGatewayOrder = {
          orderId: targetOrder.id,
          orderCode: targetOrder.orderCode,
          amount: targetOrder.amount,
          merchantOrderNo: session.merchantOrderNo,
          gatewayOrderNo: session.gatewayOrderNo,
          cashierUrl: session.cashierUrl,
        };
        window.localStorage.setItem(PENDING_GATEWAY_ORDER_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const clearPendingGatewayOrder = useCallback(() => {
    try {
      window.localStorage.removeItem(PENDING_GATEWAY_ORDER_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const createGatewaySession = useCallback(
    async (targetOrder: AdminOrder) => {
      setGatewayLoading(true);
      setGatewayError(null);
      setGatewaySession(null);
      setStatusNote(null);

      try {
        const res = await fetch('/api/silkpay/payin/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: targetOrder.id,
            orderCode: targetOrder.orderCode,
            amount: targetOrder.amount,
            userId: userInfo?.userId,
            username: userInfo?.username,
            mobileNumber: userInfo?.mobileNumber,
            returnUrl: window.location.origin,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.toLowerCase().includes('application/json');
        const data = isJson
          ? ((await res.json()) as {
              ok?: boolean;
              error?: string;
              message?: string;
              merchantOrderNo?: string;
              gatewayOrderNo?: string;
              cashierUrl?: string;
              amount?: string;
            })
          : null;

        if (!res.ok || !data?.ok || !data.cashierUrl) {
          if (res.status === 404 || !isJson) {
            setGatewayError(t.gatewayApiMissingHint);
          } else if (res.status === 503 || data?.error === 'GATEWAY_NOT_CONFIGURED') {
            setGatewayError(t.gatewayNotConfiguredHint);
          } else {
            setGatewayError(data?.message || t.gatewayNotConfiguredHint);
          }
          setGatewayLoading(false);
          return;
        }

        const nextSession: GatewaySession = {
          merchantOrderNo: data.merchantOrderNo || '',
          gatewayOrderNo: data.gatewayOrderNo || '',
          cashierUrl: data.cashierUrl,
          amount: data.amount,
        };
        setGatewaySession(nextSession);
        persistPendingGatewayOrder(targetOrder, nextSession);
      } catch {
        setGatewayError(t.gatewayNotConfiguredHint);
      } finally {
        setGatewayLoading(false);
      }
    },
    [
      userInfo?.userId,
      userInfo?.username,
      userInfo?.mobileNumber,
      t.gatewayNotConfiguredHint,
      t.gatewayApiMissingHint,
      persistPendingGatewayOrder,
    ]
  );

  useEffect(() => {
    setStep('pay_link');
    setErrorMsg(null);
    setUtrRef('');
    setSubmittedReceipt(null);
    setStatusNote(null);
    if (order) {
      void createGatewaySession(order);
    } else {
      setGatewaySession(null);
      setGatewayError(null);
      setGatewayLoading(false);
    }
  }, [order, createGatewaySession]);

  // Auto-poll live gateway payment status while inline checkout iframe is open
  useEffect(() => {
    if (step !== 'inline_gateway' || !order || !gatewaySession?.merchantOrderNo) return;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const res = await fetch('/api/silkpay/payin/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNo: gatewaySession.merchantOrderNo }),
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.toLowerCase().includes('application/json')) return;
        const data = (await res.json()) as {
          ok?: boolean;
          isPaid?: boolean;
          payinState?: number;
          utr?: string | null;
        };
        if (cancelled) return;
        if (data.isPaid || data.payinState === 2) {
          const finalRef = (data.utr || gatewaySession.merchantOrderNo).trim();
          const submitRes = onSubmitPayment(order.id, order.amount, finalRef);
          if (submitRes.ok) {
            clearPendingGatewayOrder();
            setSubmittedReceipt({
              paidAmount: submitRes.paidAmount ?? order.amount,
              totalPayout: submitRes.totalPayout ?? order.amount * 1.11,
              utr: finalRef,
            });
            setStep('pending');
          }
        }
      } catch {
        // ignore transient polling failure
      }
    };

    const timer = window.setInterval(() => {
      void pollStatus();
    }, 4500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [step, order, gatewaySession?.merchantOrderNo, onSubmitPayment, clearPendingGatewayOrder]);

  if (!order) return null;

  const { commission, totalReturn } = calculateCommission(order.amount);

  const handleCheckGatewayStatus = async () => {
    if (!gatewaySession?.merchantOrderNo || checkingStatus) return;
    setCheckingStatus(true);
    setErrorMsg(null);
    setStatusNote(null);

    try {
      const res = await fetch('/api/silkpay/payin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo: gatewaySession.merchantOrderNo }),
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.toLowerCase().includes('application/json')
        ? ((await res.json()) as {
            ok?: boolean;
            isPaid?: boolean;
            payinState?: number;
            utr?: string | null;
            message?: string;
          })
        : null;

      if (res.ok && data && (data.isPaid || data.payinState === 2)) {
        const finalRef = (data.utr || gatewaySession.merchantOrderNo).trim();
        setUtrRef(finalRef);
        const submitRes = onSubmitPayment(order.id, order.amount, finalRef);
        if (submitRes.ok) {
          clearPendingGatewayOrder();
          setSubmittedReceipt({
            paidAmount: submitRes.paidAmount ?? order.amount,
            totalPayout: submitRes.totalPayout ?? order.amount * 1.11,
            utr: finalRef,
          });
          setStep('pending');
        }
      } else {
        setStatusNote(t.gatewayStillPending);
      }
    } catch {
      setStatusNote(t.gatewayStillPending);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUtr = utrRef.trim();
    if (!cleanUtr || cleanUtr.length < 4) {
      setErrorMsg(t.utrInvalidError);
      return;
    }

    setSubmittingUtr(true);
    setErrorMsg(null);

    if (gatewaySession?.merchantOrderNo) {
      try {
        await fetch('/api/silkpay/payin/utr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantOrderNo: gatewaySession.merchantOrderNo,
            utr: cleanUtr,
          }),
        });
      } catch {
        // Still allow VaultPay submission logging if upstream UTR sync is offline
      }
    }

    const res = onSubmitPayment(order.id, order.amount, cleanUtr);
    setSubmittingUtr(false);

    if (!res.ok) {
      setErrorMsg(res.error ?? t.submitPaymentFailed);
      return;
    }
    clearPendingGatewayOrder();
    setSubmittedReceipt({
      paidAmount: res.paidAmount ?? order.amount,
      totalPayout: res.totalPayout ?? order.amount * 1.11,
      utr: cleanUtr,
    });
    setStep('pending');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-pay-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="w-full max-w-[410px] overflow-hidden rounded-t-3xl border border-white/10 bg-[#0F172A] shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div>
            <h3 id="order-pay-modal-title" className="text-sm font-bold text-slate-100">
              {step === 'pay_link' && `${t.orderPrefix} · ${formatINR(order.amount, false)}`}
              {step === 'inline_gateway' && `${t.orderPrefix} · ${formatINR(order.amount, false)}`}
              {step === 'enter_utr' && t.enterPaymentUtrTitle}
              {step === 'pending' && t.paymentSubmittedTitle}
            </h3>
            <p className="font-mono text-[11px] text-slate-400">
              {order.orderCode}
              {gatewaySession?.merchantOrderNo
                ? ` · ${gatewaySession.merchantOrderNo}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancelBtn}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 p-4">
          {/* STEP 1: Order Amount + Automatic Payment Gateway Checkout */}
          {step === 'pay_link' && (
            <>
              <div className="rounded-xl border border-white/[0.08] bg-[#080D1A] p-4 text-center">
                <p className="text-[11px] font-medium text-slate-400">
                  {t.orderPaymentAmount}
                </p>
                <p className="mt-1 font-mono text-3xl font-bold text-white tabular-nums">
                  {formatINR(order.amount)}
                </p>
                <div className="mt-3 space-y-1.5 rounded-xl border border-emerald-400/20 bg-[#0F172A] px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">{t.commissionEarnShort} (+11%)</span>
                    <span className="font-mono font-bold text-emerald-300 tabular-nums">
                      +{formatINR(commission)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                    <span className="font-semibold text-slate-200">{t.payoutAfterApprovalLabel}</span>
                    <span className="font-mono text-sm font-bold text-amber-300 tabular-nums">
                      {formatINR(totalReturn)}
                    </span>
                  </div>
                </div>
                <p className="mt-2.5 text-[11px] text-slate-400">
                  {t.tapBelowToOpenLink}
                </p>
              </div>

              {gatewayLoading && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-xs font-semibold text-amber-300">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{t.gatewayPreparing}</span>
                </div>
              )}

              {!gatewayLoading && gatewaySession && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{t.gatewayReadyBadge}</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-300">
                      {gatewaySession.gatewayOrderNo || gatewaySession.merchantOrderNo}
                    </span>
                  </div>

                  {/* Inside APK WebView: navigate in the same WebView (no target="_blank") so SwiftAPK opens gateway directly */}
                  <a
                    href={gatewaySession.cashierUrl}
                    target={isStandalone ? undefined : '_blank'}
                    rel={isStandalone ? undefined : 'noopener noreferrer'}
                    onClick={() => {
                      persistPendingGatewayOrder(order, gatewaySession);
                      if (!isStandalone) {
                        setStep('enter_utr');
                      }
                    }}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-xs font-bold text-[#070B14] transition-transform hover:bg-amber-300 active:scale-[0.98]"
                  >
                    <span>
                      {t.gatewayOpenBtn} ({formatINR(order.amount, false)})
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      persistPendingGatewayOrder(order, gatewaySession);
                      setStep('inline_gateway');
                    }}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#080D1A] px-3 text-xs font-semibold text-slate-200 transition-colors hover:border-amber-400/40"
                  >
                    <CreditCard className="h-3.5 w-3.5 text-amber-300" />
                    <span>{t.gatewayOpenInlineBtn}</span>
                  </button>
                </div>
              )}

              {!gatewayLoading && gatewayError && (
                <div className="space-y-2.5">
                  <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-[11px] leading-relaxed text-rose-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <span>{gatewayError}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void createGatewaySession(order)}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-3 text-xs font-bold text-[#070B14] hover:bg-amber-300"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{t.gatewayRetryBtn}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('enter_utr')}
                      className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-white/15 bg-[#080D1A] px-3 text-xs font-semibold text-slate-200 hover:border-amber-400/40"
                    >
                      <span>{t.gatewayManualUtrFallback}</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 1B: Inline Embedded Checkout Frame */}
          {step === 'inline_gateway' && gatewaySession && (
            <div className="space-y-2.5">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
                <iframe
                  title={`Gateway Checkout ${order.orderCode}`}
                  src={gatewaySession.cashierUrl}
                  allow="payment *; clipboard-read; clipboard-write"
                  className="h-[420px] w-full border-0"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCheckGatewayStatus}
                  disabled={checkingStatus}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {checkingStatus ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>{checkingStatus ? t.gatewayCheckingStatus : t.gatewayCheckStatusBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('enter_utr')}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-[#080D1A] px-3 text-xs font-semibold text-slate-200 hover:border-amber-400/40"
                >
                  <span>{t.gatewayBackToSummaryBtn}</span>
                </button>
              </div>

              {statusNote && (
                <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  {statusNote}
                </p>
              )}
            </div>
          )}

          {/* STEP 2: Verify Live Gateway Payment Status or Enter 12-Digit UTR */}
          {step === 'enter_utr' && (
            <form onSubmit={handleSubmitUtr} className="space-y-3">
              <div className="space-y-1.5 rounded-xl border border-white/[0.08] bg-[#080D1A] px-3.5 py-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{t.orderAmountLabel}</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {formatINR(order.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                  <span className="text-slate-400">{t.payoutAfterApprovalLabel}</span>
                  <span className="font-mono font-bold text-emerald-300 tabular-nums">
                    {formatINR(totalReturn)} (+{formatINR(commission, false)})
                  </span>
                </div>
                {gatewaySession?.merchantOrderNo && (
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                    <span className="text-slate-400">{t.gatewayOrderNoLabel}</span>
                    <span className="font-mono text-[11px] text-amber-300">
                      {gatewaySession.merchantOrderNo}
                    </span>
                  </div>
                )}
              </div>

              {gatewaySession && (
                <button
                  type="button"
                  onClick={handleCheckGatewayStatus}
                  disabled={checkingStatus}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {checkingStatus ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {checkingStatus ? t.gatewayCheckingStatus : t.gatewayCheckStatusBtn}
                  </span>
                </button>
              )}

              {statusNote && (
                <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  {statusNote}
                </p>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-slate-300">
                    {t.enterUtrLabel}
                  </label>
                  {gatewaySession && (
                    <a
                      href={gatewaySession.cashierUrl}
                      target={isStandalone ? undefined : '_blank'}
                      rel={isStandalone ? undefined : 'noopener noreferrer'}
                      onClick={() => persistPendingGatewayOrder(order, gatewaySession)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200"
                    >
                      <span>{t.openLinkAgain}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <input
                  type="text"
                  autoFocus
                  value={utrRef}
                  onChange={(e) => {
                    setUtrRef(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder={t.utrPlaceholder}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/15 bg-[#080D1A] px-3.5 font-mono text-sm font-semibold text-white placeholder:font-sans placeholder:font-normal placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {errorMsg && (
                <p className="text-[11px] font-medium text-rose-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submittingUtr}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-4 text-xs font-bold text-[#070B14] transition-colors hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
              >
                <span>{t.submitUtrBtn}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          {/* STEP 3: Pending Approval Receipt */}
          {step === 'pending' && submittedReceipt && (
            <>
              <div className="flex flex-col items-center rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-[#070B14]">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="mt-2.5 inline-flex items-center rounded-md border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                  {t.statusPending}
                </span>
                <p className="mt-2 text-sm font-bold text-white">
                  {t.paymentSubmittedBanner}
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  {t.utrSentToAdminDesc}
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#090F1E] p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t.utrNumberLabel}</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {submittedReceipt.utr}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t.paidAmountLabel}</span>
                  <span className="font-mono font-semibold text-slate-100 tabular-nums">
                    {formatINR(submittedReceipt.paidAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t.payoutAfterApprovalLabel}</span>
                  <span className="font-mono font-semibold text-amber-300 tabular-nums">
                    {formatINR(submittedReceipt.totalPayout)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-10 w-full rounded-xl bg-amber-400 px-4 text-xs font-bold text-[#070B14] hover:bg-amber-300"
              >
                {t.doneBtn}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

