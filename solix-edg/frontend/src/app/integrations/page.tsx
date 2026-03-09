export default function Integrations() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-gray-900">Integrations</h1>
          <p className="mt-2 text-lg text-gray-600">Connect data sources and tools</p>
        </div>
        <button className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800 transition-colors">
          Add Integration
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 text-xl">🐘</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">PostgreSQL</h3>
              <p className="text-sm text-gray-500">Database connector</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Connect to PostgreSQL databases for metadata ingestion and lineage.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Connected</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Configure</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-xl">📊</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Tableau</h3>
              <p className="text-sm text-gray-500">BI tool connector</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Ingest dashboard metadata and establish data lineage from Tableau.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Pending</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Setup</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 text-xl">🔄</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Airflow</h3>
              <p className="text-sm text-gray-500">Pipeline connector</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Connect to Apache Airflow for pipeline metadata and execution tracking.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">Inactive</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Enable</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center">
              <span className="text-red-600 text-xl">☁️</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">AWS S3</h3>
              <p className="text-sm text-gray-500">Cloud storage</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Connect to AWS S3 buckets for data lake metadata discovery.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Connected</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Configure</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 text-xl">📈</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Power BI</h3>
              <p className="text-sm text-gray-500">Analytics platform</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Ingest Power BI reports and datasets for comprehensive analytics governance.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Pending</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Setup</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
              <span className="text-orange-600 text-xl">🔥</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">BigQuery</h3>
              <p className="text-sm text-gray-500">Data warehouse</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Connect to Google BigQuery for dataset and table metadata management.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">Inactive</span>
            <button className="text-sm text-blue-600 hover:text-blue-800">Enable</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-8">
        <div className="text-center">
          <h3 className="text-xl font-medium text-gray-900 mb-2">OpenMetadata Integration</h3>
          <p className="text-gray-600 mb-4 max-w-2xl mx-auto">
            OpenGovern leverages OpenMetadata's extensive connector ecosystem, supporting 50+ data sources including databases, BI tools, ML platforms, and cloud services.
          </p>
          <div className="flex justify-center space-x-4 text-sm">
            <span className="bg-white px-3 py-1 rounded-full text-gray-700">Auto-discovery</span>
            <span className="bg-white px-3 py-1 rounded-full text-gray-700">Lineage tracking</span>
            <span className="bg-white px-3 py-1 rounded-full text-gray-700">Usage analytics</span>
            <span className="bg-white px-3 py-1 rounded-full text-gray-700">Quality monitoring</span>
          </div>
        </div>
      </div>
    </div>
  );
}