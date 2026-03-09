export default function Classifications() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-light text-gray-900">Classifications</h1>
        <p className="mt-2 text-lg text-gray-600">Manage data classifications and tags</p>
      </div>
      <div className="rounded-xl bg-white p-8 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">Classification Management</h3>
        <p className="text-gray-600">PII, sensitive data, and custom classification tags</p>
      </div>
    </div>
  );
}