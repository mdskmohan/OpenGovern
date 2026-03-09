export default function Metrics() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-light text-gray-900">Metrics</h1>
        <p className="mt-2 text-lg text-gray-600">Platform usage and performance metrics</p>
      </div>
      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">Analytics Dashboard</h3>
        <p className="text-gray-600">Usage analytics, adoption metrics, and governance insights</p>
      </div>
    </div>
  );
}