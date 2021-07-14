from uuid import uuid4

class TreeNode():
    def _format(self, name):
        return name + ('(%s)' % uuid4())

    def __init__(self, name, parentNode = None):
        self.parent_node = parentNode
        self.id = self._format(name)

    def extends(self, name):
        return TreeNode(name, self)

    def explain(self):
        return self.parent_node.explain() + [self.id] if self.parent_node else [self.id]

    def __str__(self):
        return ' > '.join(self.explain())

