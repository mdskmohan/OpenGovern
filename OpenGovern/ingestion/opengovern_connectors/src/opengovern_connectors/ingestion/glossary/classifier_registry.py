from opengovern_connectors.ingestion.api.registry import PluginRegistry
from opengovern_connectors.ingestion.glossary.classifier import Classifier
from opengovern_connectors.ingestion.glossary.datahub_classifier import DataHubClassifier

classifier_registry = PluginRegistry[Classifier]()

classifier_registry.register("datahub", DataHubClassifier)
