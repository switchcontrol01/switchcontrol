import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, History as HistoryIcon, FileJson, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function History() {
  const { history, resetData } = useStore();

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "switchcontrol_history.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <AppLayout>
      <div className="space-y-6 h-full flex flex-col">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <HistoryIcon className="size-8 text-primary" />
              Scan History
            </h1>
            <p className="text-muted-foreground mt-2">
              Log of all simulated optimization actions.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetData} className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
              <Trash2 className="size-4" />
              Clear History
            </Button>
            <Button onClick={handleExport} className="gap-2">
              <FileJson className="size-4" />
              Export JSON
            </Button>
          </div>
        </div>

        <Card className="flex-1 bg-card/50 border-border/50 backdrop-blur-sm overflow-hidden flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[600px]">
              <div className="divide-y divide-border/50">
                {history.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No actions recorded yet. Try applying some tweaks!
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-white">{item.action}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                            {item.page}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Result: <span className="text-emerald-400">{item.result}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-muted-foreground">
                          {format(new Date(item.timestamp), "MMM d, HH:mm:ss")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
