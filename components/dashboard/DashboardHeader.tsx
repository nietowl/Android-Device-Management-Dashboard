"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bell, Search, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";

interface DashboardHeaderProps {
  onSearch?: (query: string) => void;
}

export default function DashboardHeader({ onSearch }: DashboardHeaderProps) {
  const [notifications, setNotifications] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const { colorMode, toggleColorMode } = useTheme();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery);
    }
  };

  return (
    <header className="h-16 border-b border-border/50 flex items-center justify-between px-6 md:px-8 bg-card/50 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-4 flex-1">
        <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Device Management</h1>
        
        {/* Search Bar */}
        {onSearch && (
          <form onSubmit={handleSearch} className="flex-1 max-w-md ml-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search devices, actions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-input bg-background/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all shadow-sm hover:shadow-md"
              />
            </div>
          </form>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Dark Mode Toggle */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleColorMode}
          className="hover:bg-accent transition-colors"
          aria-label={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {colorMode === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
        
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative hover:bg-accent transition-colors">
          <Bell className="h-5 w-5" />
          {notifications > 0 && (
            <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-semibold shadow-md animate-pulse">
              {notifications > 9 ? "9+" : notifications}
            </span>
          )}
        </Button>
      </div>
    </header>
  );
}

