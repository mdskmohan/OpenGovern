export default function DataQuality() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-light text-gray-900">Data Quality</h1>
        <p className="mt-2 text-lg text-gray-600">Monitor and ensure data quality across your organization</p>
      </div>
      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">Quality Monitoring Dashboard</h3>
        <p className="text-gray-600">Integrated with OpenMetadata's data quality framework</p>
      </div>
    </div>
  );
}