import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Save, RotateCcw, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { account, resetData } = useStore();
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <SettingsIcon className="size-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage application preferences and account details.
          </p>
        </div>

        <div className="grid gap-6">
          {/* General Settings */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Configure general app behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable App Booster</Label>
                  <p className="text-xs text-muted-foreground">Automatically optimize priority for active games.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Real-time Metrics</Label>
                  <p className="text-xs text-muted-foreground">Update dashboard stats every second.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Pause when minimized</Label>
                  <p className="text-xs text-muted-foreground">Stop polling stats when app is in background.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Account Settings */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your subscription details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={account.email} readOnly className="bg-muted/50" />
              </div>
              <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-md">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium text-emerald-400">Premium Plan Active</span>
                  <p className="text-xs text-emerald-500/70">License valid until Dec 2026</p>
                </div>
                <Button variant="outline" size="sm" className="border-emerald-500/20 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                  Manage
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="bg-red-500/5 border-red-500/10">
            <CardHeader>
              <CardTitle className="text-red-400">Data Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                 <Button variant="outline" onClick={resetData} className="border-red-500/20 hover:bg-red-500/10 text-red-400">
                   <RotateCcw className="size-4 mr-2" />
                   Reset App Data
                 </Button>
                 <Button variant="outline" className="border-border/50">
                   <FolderOpen className="size-4 mr-2" />
                   Open Log Directory
                 </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
