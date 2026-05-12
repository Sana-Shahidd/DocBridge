import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navbar from './components/Navbar'
import UploadPage from './pages/UploadPage'
import ResultsPage from './pages/ResultsPage'
import ReportsPage from './pages/ReportsPage'
import DashboardPage from './pages/DashboardPage'
import SourceSealPage from './pages/SourceSealPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/"               element={<UploadPage />} />
          <Route path="/results/:id"    element={<ResultsPage />} />
          <Route path="/reports"        element={<ReportsPage />} />
          <Route path="/dashboard"      element={<DashboardPage />} />
          <Route path="/source-protect" element={<SourceSealPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
