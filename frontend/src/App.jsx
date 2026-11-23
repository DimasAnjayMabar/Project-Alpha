import React, { useState, useEffect, lazy, Suspense } from 'react';
import UserCatalogPage from './user/UserCatalogPage';
import {
  DB_STORAGE_KEY,
  loadSharedDatabase,
  saveSharedDatabase,
} from './seller/utils/sellerService';

const SellerPortalPage = lazy(() => import('./seller/SellerPortalPage'));
const SellerRegisterView = lazy(() => import('./seller/components/SellerRegisterView'));

function resolveRouteFromPath(pathname) {
  const cleanPath = String(pathname || '').toLowerCase().replace(/\/+$/, '');
  if (cleanPath === '/seller') return 'seller';
  if (cleanPath === '/register') return 'register';
  return 'user';
}

export default function App() {
  const [db, setDb] = useState(() => loadSharedDatabase());
  const [activeRoute, setActiveRoute] = useState(() =>
    resolveRouteFromPath(window.location.pathname)
  );
  const [focusShopId, setFocusShopId] = useState(null);

  // Pastikan URL selain /user, /seller, dan /register diarahkan ke /user
  useEffect(() => {
    const cleanPath = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    if (cleanPath !== '/user' && cleanPath !== '/seller' && cleanPath !== '/register') {
      window.history.replaceState({}, '', '/user');
    }
  }, []);

  // Simpan setiap perubahan database lokal ke localStorage
  useEffect(() => {
    saveSharedDatabase(db);
  }, [db]);

  // Dengarkan tombol Back / Forward browser
  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = resolveRouteFromPath(window.location.pathname);
      setActiveRoute(nextRoute);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sinkronisasi data otomatis antar-tab (/seller <-> /user)
  useEffect(() => {
    const handleStorageSync = (e) => {
      if (e.key === DB_STORAGE_KEY) {
        setDb(loadSharedDatabase());
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  const navigateToUserCatalog = (shopIdToFocus = null) => {
    const validShopId = typeof shopIdToFocus === 'string' ? shopIdToFocus : null;
    window.history.pushState({}, '', '/user');
    setFocusShopId(validShopId);
    setActiveRoute('user');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const navigateToSellerPortal = () => {
    window.history.pushState({}, '', '/seller');
    setActiveRoute('seller');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (activeRoute === 'register') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F7F4EE] flex items-center justify-center font-serif text-lg text-[#1C1917]">
            Memuat Pendaftaran Sanggar...
          </div>
        }
      >
        <SellerRegisterView
          onRegisterSuccess={navigateToSellerPortal}
          onBackToCatalog={() => navigateToUserCatalog(null)}
        />
      </Suspense>
    );
  }

  if (activeRoute === 'seller') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F7F4EE] flex items-center justify-center font-serif text-lg text-[#1C1917]">
            Memuat Portal Perajin...
          </div>
        }
      >
        <SellerPortalPage
          db={db}
          setDb={setDb}
          onOpenUserCatalog={navigateToUserCatalog}
        />
      </Suspense>
    );
  }

  return (
    <UserCatalogPage
      key={focusShopId || 'default'}
      externalDb={db}
      onExternalDbChange={setDb}
      initialFocusShopId={focusShopId}
      onOpenSellerPortal={navigateToSellerPortal}
    />
  );
}