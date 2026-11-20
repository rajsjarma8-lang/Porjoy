import React, { useEffect, useRef, useState } from 'react';
import { useWalletStore } from './hooks/useWalletStore';
import { usePWAInstall } from './hooks/usePWAInstall';
import { AdminOrder, NavTab } from './types/wallet';
import { useLanguage } from './i18n/LanguageContext';
import { isAdminMobile } from './utils/formatters';
import { TopHeader } from './components/TopHeader';
import { BalanceHeroCard } from './components/BalanceHeroCard';
import { OrderGrabSection } from './components/OrderGrabSection';
import {
  OrderBreakdownModal,
  PENDING_GATEWAY_ORDER_KEY,
  PendingGatewayOrder,
} from './components/OrderBreakdownModal';
import { DepositWithdrawModal } from './components/DepositWithdrawModal';
import { AuthPage } from './components/AuthPage';
import { DownloadAppPage } from './components/DownloadAppPage';
import { PaymentView } from './components/PaymentView';
import { WalletView } from './components/WalletView';
import { StatisticsView } from './components/StatisticsView';
import { ProfileView } from './components/ProfileView';
import { SupportWidget } from './components/UtilityModals';
import { BottomNavBar } from './components/BottomNavBar';

export default function App() {
  const { lang } = useLanguage();
  const { isStandalone, envChecked } = usePWAInstall();
  const {
    state,
    adminUsers,
    userMessages,
    adminChatThreads,
    registerAccount,
    loginAccount,
    logoutAccount,
    linkPaymentApp,
    unlinkPaymentApp,
    addAdminOrder,
    removeAdminOrder,
    submitOrderPayment,
    approvePendingOrder,
    rejectPendingOrder,
    withdrawFunds,
    approveWithdrawalRequest,
    rejectWithdrawalRequest,
    settlePendingWithdrawal,
    markNotificationsRead,
    syncAdminUsersFromServer,
    syncUserMessagesFromServer,
    sendUserSupportMessage,
    syncAdminMessagesFromServer,
    sendAdminChatReply,
    markAdminChatRead,
    resetUserPassword,
  } = useWalletStore(lang);

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [continueInBrowser, setContinueInBrowser] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const hasReturnOrder = new URLSearchParams(window.location.search).has('vp_order');
      return (
        hasReturnOrder ||
        window.sessionStorage.getItem('vaultpay_web_app_open_v1') === '1'
      );
    } catch {
      return false;
    }
  });
  const [returnedGatewayOrderNo, setReturnedGatewayOrderNo] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return new URLSearchParams(window.location.search).get('vp_order');
    } catch {
      return null;
    }
  });
  const handledReturnRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('vp_order')) {
        url.searchParams.delete('vp_order');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // ignore URL cleanup error
    }
  }, []);

  useEffect(() => {
    if (!returnedGatewayOrderNo || !state.authAccount) return;
    if (handledReturnRef.current === returnedGatewayOrderNo) return;

    let pending: PendingGatewayOrder | null = null;
    try {
      const raw = window.localStorage.getItem(PENDING_GATEWAY_ORDER_KEY);
      if (raw) {
        pending = JSON.parse(raw) as PendingGatewayOrder;
      }
    } catch {
      pending = null;
    }

    const matchingOrder = pending
      ? state.adminOrders.find(
          (o) =>
            o.id === pending?.orderId ||
            (pending?.orderCode && o.orderCode === pending.orderCode)
        )
      : undefined;

    if (!matchingOrder || matchingOrder.status !== 'active') {
      return;
    }

    handledReturnRef.current = returnedGatewayOrderNo;

    void (async () => {
      try {
        const res = await fetch('/api/silkpay/payin/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNo: returnedGatewayOrderNo }),
        });
        const ct = res.headers.get('content-type') || '';
        const data = ct.toLowerCase().includes('application/json')
          ? ((await res.json()) as {
              ok?: boolean;
              isPaid?: boolean;
              payinState?: number;
              utr?: string | null;
            })
          : null;

        if (res.ok && data && (data.isPaid || data.payinState === 2)) {
          const ref = (data.utr || returnedGatewayOrderNo).trim();
          submitOrderPayment(matchingOrder.id, matchingOrder.amount, ref);
          try {
            window.localStorage.removeItem(PENDING_GATEWAY_ORDER_KEY);
          } catch {
            // ignore
          }
          setActiveTab('order');
          setReturnedGatewayOrderNo(null);
          return;
        }
      } catch {
        // fallback to reopening order modal for status check / manual UTR
      }
      setSelectedOrder(matchingOrder);
      setReturnedGatewayOrderNo(null);
    })();
  }, [returnedGatewayOrderNo, state.authAccount, state.adminOrders, submitOrderPayment]);

  // Step 1: Always require Login / Sign Up first when clicking any link
  if (!state.authAccount) {
    return (
      <AuthPage
        prefilledReferralCode={state.referredBy}
        onRegister={registerAccount}
        onLogin={loginAccount}
      />
    );
  }

  const isAdminUser = isAdminMobile(state.authAccount?.mobileNumber);

  const handleOpenWebsiteApp = () => {
    try {
      window.sessionStorage.setItem('vaultpay_web_app_open_v1', '1');
    } catch {
      // ignore storage errors
    }
    setContinueInBrowser(true);
  };

  const handleFullLogout = () => {
    try {
      window.sessionStorage.removeItem('vaultpay_web_app_open_v1');
    } catch {
      // ignore storage errors
    }
    setContinueInBrowser(false);
    logoutAccount();
    setActiveTab('home');
  };

  // Step 2: In browser (outside the installed app / APK), show the Download screen with an "Open in Website" option.
  // Inside the installed standalone app or Android APK (isStandalone === true), this Download screen never appears.
  if (!isStandalone && !continueInBrowser) {
    if (!envChecked) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#070B14]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/25 border-t-amber-400" />
        </div>
      );
    }
    return (
      <DownloadAppPage
        authAccount={state.authAccount}
        referredBy={state.referredBy}
        onOpenWebsite={handleOpenWebsiteApp}
        onLogout={handleFullLogout}
      />
    );
  }

  const handleOpenWallet = () => {
    setActiveTab('order');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenPaymentApps = () => {
    setActiveTab('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pendingCount = state.adminOrders.filter((o) => o.status === 'pending').length;
  const isPaymentAppLinked = Boolean(state.linkedPaymentApp);

  return (
    <div className="min-h-screen bg-[#04070E] text-slate-100">
      <div className="relative mx-auto min-h-screen max-w-[430px] border-x border-white/[0.06] bg-[#070B14] pb-20 shadow-2xl shadow-black">
        <TopHeader
          profile={state.profile}
          notifications={state.notifications}
          onSelectTab={setActiveTab}
          onMarkNotificationsRead={markNotificationsRead}
        />

        <main className="px-3.5 pt-3.5">
          {activeTab === 'home' && (
            <div className="space-y-3.5">
              <BalanceHeroCard
                walletBalance={state.walletBalance}
                totalPaid={state.totalPaid}
                totalWithdrawal={state.totalWithdrawal}
                totalCashbackEarned={state.totalCashbackEarned}
                onOpenWallet={handleOpenWallet}
                onOpenWithdraw={() => setWithdrawOpen(true)}
              />

              <OrderGrabSection
                adminOrders={state.adminOrders}
                isPaymentAppLinked={isPaymentAppLinked}
                onSelectOrder={(order) => setSelectedOrder(order)}
                onGoToPaymentApps={handleOpenPaymentApps}
                showPaidStatuses={false}
              />
            </div>
          )}

          {activeTab === 'order' && (
            <WalletView
              state={state}
              onSelectOrder={(order) => setSelectedOrder(order)}
              onOpenWithdraw={() => setWithdrawOpen(true)}
              onSettlePending={settlePendingWithdrawal}
              onGoToPaymentApps={handleOpenPaymentApps}
            />
          )}

          {activeTab === 'payment' && (
            <PaymentView
              linkedPaymentApp={state.linkedPaymentApp}
              onLinkPaymentApp={linkPaymentApp}
              onUnlinkPaymentApp={unlinkPaymentApp}
              onOrdersUnlockedGoHome={() => setActiveTab('home')}
            />
          )}

          {activeTab === 'statistics' && (
            <StatisticsView
              state={state}
              onSettlePending={settlePendingWithdrawal}
            />
          )}

          {activeTab === 'my' && (
            <ProfileView
              isAdmin={isAdminUser}
              profile={state.profile}
              referredBy={state.referredBy}
              authAccount={state.authAccount}
              adminOrders={state.adminOrders}
              withdrawRequests={state.withdrawRequests}
              adminUsers={adminUsers}
              adminChatThreads={adminChatThreads}
              referrals={state.referrals}
              referralBonusEarned={state.referralBonusEarned}
              onLogoutAccount={handleFullLogout}
              onAddAdminOrder={addAdminOrder}
              onApproveOrder={approvePendingOrder}
              onRejectOrder={rejectPendingOrder}
              onRemoveAdminOrder={removeAdminOrder}
              onApproveWithdrawal={approveWithdrawalRequest}
              onRejectWithdrawal={rejectWithdrawalRequest}
              onRefreshAdminUsers={syncAdminUsersFromServer}
              onRefreshAdminMessages={syncAdminMessagesFromServer}
              onSendAdminChatReply={sendAdminChatReply}
              onMarkAdminChatRead={markAdminChatRead}
              onResetUserPassword={resetUserPassword}
            />
          )}
        </main>

        <BottomNavBar
          activeTab={activeTab}
          pendingCount={pendingCount}
          onSelectTab={setActiveTab}
        />

        <SupportWidget
          availableBalance={state.walletBalance}
          messages={userMessages}
          onSendMessage={sendUserSupportMessage}
          onOpenMarkRead={() => {
            void syncUserMessagesFromServer(true);
          }}
        />
      </div>

      <OrderBreakdownModal
        order={selectedOrder}
        isStandalone={isStandalone}
        userInfo={{
          userId: state.profile.userId,
          username: state.profile.username,
          mobileNumber:
            state.authAccount?.mobileNumber ||
            state.linkedPaymentApp?.mobileNumber ||
            state.profile.mobileNumber,
        }}
        onClose={() => setSelectedOrder(null)}
        onSubmitPayment={submitOrderPayment}
      />

      <DepositWithdrawModal
        isOpen={withdrawOpen}
        walletBalance={state.walletBalance}
        profile={state.profile}
        authMobile={state.authAccount?.mobileNumber}
        onClose={() => setWithdrawOpen(false)}
        onWithdraw={withdrawFunds}
      />
    </div>
  );
}
