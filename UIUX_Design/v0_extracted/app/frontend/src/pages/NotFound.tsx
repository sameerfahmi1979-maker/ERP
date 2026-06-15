import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const EMPTY_STATE_IMAGE = "https://mgx-backend-cdn.metadl.com/generate/images/587190/2026-05-27/plapo7aaag4a/empty-state-no-data.png";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-md animate-fade-in">
        <img src={EMPTY_STATE_IMAGE} alt="Not Found" className="w-48 h-48 mx-auto mb-6 opacity-80" />
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Link to="/dashboard">
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}