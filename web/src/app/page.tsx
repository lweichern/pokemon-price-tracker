"use client";

import { useState } from "react";
import Overview from "./components/Overview";
import Signals from "./components/Signals";
import Sets from "./components/Sets";
import CardDetail from "./components/CardDetail";
import HaloTracker from "./components/HaloTracker";
import SealedTracker from "./components/SealedTracker";
import PriceTracker from "./components/PriceTracker";
import Portfolio from "./components/Portfolio";
import Calendar from "./components/Calendar";

const TABS = [
  "Overview",
  "Signals",
  "Sets",
  "Halo Tracker",
  "Sealed",
  "Price Tracker",
  "Portfolio",
  "Calendar",
] as const;

type Tab = (typeof TABS)[number];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);

  function handleSelectCard(productId: number) {
    setSelectedCardId(productId);
  }

  function handleBackFromCard() {
    setSelectedCardId(null);
  }

  if (selectedCardId !== null) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-[#e5e7eb] px-6 py-4 bg-white">
          <h1
            className="text-xl font-bold tracking-tight cursor-pointer"
            style={{ color: "#2A75BB" }}
            onClick={handleBackFromCard}
          >
            TCG INTEL
          </h1>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">
          <CardDetail
            productId={selectedCardId}
            onBack={handleBackFromCard}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#e5e7eb] px-6 py-4 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "#2A75BB" }}
          >
            TCG INTEL
          </h1>
          <p className="text-sm" style={{ color: "#9ca3af" }}>
            Pokémon TCG Market Intelligence
          </p>
        </div>
      </header>

      <nav className="border-b border-[#e5e7eb] px-6 bg-white">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative"
              style={{
                color: activeTab === tab ? "#1a1a2e" : "#9ca3af",
              }}
            >
              {tab}
              {activeTab === tab && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: "#FFCB05" }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === "Overview" && <Overview />}
        {activeTab === "Signals" && (
          <Signals onSelectCard={handleSelectCard} />
        )}
        {activeTab === "Sets" && <Sets onSelectCard={handleSelectCard} />}
        {activeTab === "Halo Tracker" && (
          <HaloTracker onSelectCard={handleSelectCard} />
        )}
        {activeTab === "Sealed" && <SealedTracker />}
        {activeTab === "Price Tracker" && <PriceTracker />}
        {activeTab === "Portfolio" && <Portfolio />}
        {activeTab === "Calendar" && <Calendar />}
      </main>
    </div>
  );
}
