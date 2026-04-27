"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import { navigation } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CommandLauncher({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Command Launcher</DialogTitle>
          <DialogDescription>Phase 1 ships the keyboard-first shell and navigation shortcuts. Deep command actions can grow from here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 p-5">
          <div className="rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
            <Search className="mr-2 inline-flex h-4 w-4" />
            Search actions, routes, and future bulk commands
          </div>
          <div className="grid gap-2">
            {navigation.map((item) => (
              <Button key={item.href} asChild variant="outline" className="justify-start">
                <Link href={item.href} onClick={() => onOpenChange(false)}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

