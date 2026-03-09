export default function Alerts() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-light text-gray-900">Alerts</h1>
        <p className="mt-2 text-lg text-gray-600">Monitor platform alerts and notifications</p>
      </div>
      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-5 5v-5zM4.868 12.683A17.925 17.925 0 0112 21c7.962 0 12-1.21 12-2.683m-12 2.683l-9-9 3.5-3.5 5.5 5.5 9-9L21 12m-9 9v-9" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">Alert Center</h3>
        <p className="text-gray-600">Policy violations, ingestion failures, and workflow notifications</p>
      </div>
    </div>
  );
}