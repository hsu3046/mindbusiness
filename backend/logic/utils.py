"""
Utility functions for mindmap data conversion.
"""

from schemas.mindmap_schema import MindmapNode


def mindmap_to_markdown(root_node: MindmapNode) -> str:
    """
    Convert mindmap tree structure to Markdown format.
    
    Args:
        root_node: Root node of the mindmap
    
    Returns:
        Markdown formatted string
    
    Format:
        # Root (Level 0)
        ## Main Branch (Level 1)
        ### Sub Branch (Level 2)
    """
    lines = []
    
    def node_to_markdown(node: MindmapNode, level: int = 0):
        """Recursively convert node to markdown."""
        # Determine heading level (# for root, ## for level 1, ### for level 2)
        heading = "#" * (level + 1)
        
        # Add node label
        lines.append(f"{heading} {node.label}")
        lines.append("")  # Empty line for readability
        
        # Add description if exists
        if node.description:
            lines.append(node.description)
            lines.append("")
        
        # Process children recursively
        for child in node.children:
            node_to_markdown(child, level + 1)
    
    # Convert starting from root
    node_to_markdown(root_node)
    
    return "\n".join(lines)
