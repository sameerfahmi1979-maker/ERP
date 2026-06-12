import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Truck, Shield, BarChart3, Users } from "lucide-react";

const LOGIN_IMAGE = "https://mgx-backend-cdn.metadl.com/generate/images/587190/2026-05-27/plapoeqaag6q/login-side-illustration.png";
const LOGO_IMAGE = "https://mgx-backend-cdn.metadl.com/generate/images/587190/2026-05-27/plapp3yaag3a/logo-agt-monogram.png";

const features = [
  { icon: Truck, label: "Fleet Management", desc: "Track and manage your entire fleet" },
  { icon: Shield, label: "HSE Compliance", desc: "Safety and environmental monitoring" },
  { icon: BarChart3, label: "Real-time Analytics", desc: "Data-driven decision making" },
  { icon: Users, label: "HR & Workforce", desc: "Complete employee management" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate("/dashboard");
    }, 1000);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left branded panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwdi02aC02djZoNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo and brand */}
          <div className="flex items-center gap-3">
            <img src={LOGO_IMAGE} alt="AGT Logo" className="w-12 h-12 rounded-lg" />
            <div>
              <h1 className="text-white text-xl font-bold">Alliance Gulf Transport</h1>
              <p className="text-blue-200 text-sm">Enterprise Resource Planning</p>
            </div>
          </div>

          {/* Center illustration */}
          <div className="flex-1 flex items-center justify-center py-8">
            <img 
              src={LOGIN_IMAGE} 
              alt="ERP Illustration" 
              className="w-full max-w-md rounded-2xl shadow-2xl opacity-90"
            />
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature) => (
              <div key={feature.label} className="flex items-start gap-3 p-3 rounded-xl bg-white/10 backdrop-blur-sm">
                <feature.icon className="w-5 h-5 text-teal-300 mt-0.5 shrink-0" />
                <div>
                  <p className="text-white text-sm font-medium">{feature.label}</p>
                  <p className="text-blue-200 text-xs">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img src={LOGO_IMAGE} alt="AGT Logo" className="w-10 h-10 rounded-lg" />
            <div>
              <h1 className="text-lg font-bold">Alliance Gulf Transport</h1>
              <p className="text-muted-foreground text-xs">Enterprise Resource Planning</p>
            </div>
          </div>

          <Card className="shadow-xl border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription>Sign in to access your ERP workspace</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@alliancegulf.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <button type="button" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-10 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4 pt-2">
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <button type="button" className="text-primary font-medium hover:underline">
                    Contact Admin
                  </button>
                </p>
              </CardFooter>
            </form>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            © 2026 Alliance Gulf Transport. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}