import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AppRegistryPage } from "./pages/AppRegistryPage";
import { CommandRegistryPage } from "./pages/CommandRegistryPage";
import { ExportPage } from "./pages/ExportPage";
import { KeyMappingPage } from "./pages/KeyMappingPage";
import { OverviewPage } from "./pages/OverviewPage";
export default function App(){return <Routes><Route element={<AppLayout/>}><Route path="/" element={<OverviewPage/>}/><Route path="/apps" element={<AppRegistryPage/>}/><Route path="/commands" element={<CommandRegistryPage/>}/><Route path="/mapping" element={<KeyMappingPage/>}/><Route path="/export" element={<ExportPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes>}
