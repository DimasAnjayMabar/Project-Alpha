import React, { useState, useEffect, lazy, Suspense } from 'react';
import UserCatalogPage from './user/UserCatalogPage';
import {
  DB_STORAGE_KEY,
  loadSharedDatabase,
  saveSharedDatabase,
} from './seller/utils/sellerService';

const SellerPortalPage = lazy(() => import('./seller/SellerPortalPage'));

function resolveRouteFromPath(pathname) {
  const cleanPath = String(pathname || '').toLowerCase().replace(/\/+$/, '');
  if (cleanPath === '/seller') return 'seller';
  return 'user';
}

export default function App() {
  const [db, setDb] = useState(() => loadSharedDatabase());
  const [activeRoute, setActiveRoute] = useState(() =>
    resolveRouteFromPath(window.location.pathname)
  );
  const [focusShopId, setFocusShopId] = useState(null);

  // Pastikan URL root (/) otomatis diarahkan ke /user
  useEffect(() => {
    const cleanPath = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    if (cleanPath !== '/user' && cleanPath !== '/seller') {
      window.history.replaceState({}, '', '/user');
      setActiveRoute('user');
    }
  }, []);

  // Simpan setiap perubahan database ke localStorage
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
    window.history.pushState({}, '', '/user');
    setFocusShopId(shopIdToFocus);
    setActiveRoute('user');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (activeRoute === 'seller') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center font-serif text-lg font-bold text-[#2C241E]">
            Memuat Portal Seller UMKM...
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
      externalDb={db}
      onExternalDbChange={setDb}
      initialFocusShopId={focusShopId}
    />
  );
}